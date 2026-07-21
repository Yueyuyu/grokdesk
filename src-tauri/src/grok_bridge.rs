use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    time::{sleep, timeout},
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

type PendingResponse = oneshot::Sender<Result<Value, String>>;

#[derive(Default)]
pub struct GrokBridge {
    child: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pending: Arc<Mutex<HashMap<u64, PendingResponse>>>,
    session_id: Arc<Mutex<Option<String>>>,
    next_id: AtomicU64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    available: bool,
    authentication_state: String,
    executable_path: Option<String>,
    version: Option<String>,
    auth_file_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokSubscription {
    availability: String,
    tier: Option<String>,
    credit_usage_percent: Option<f64>,
    period_end: Option<String>,
    message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthResult {
    succeeded: bool,
    message: Option<String>,
}

fn subscription_from_billing(billing: &Value) -> GrokSubscription {
    let config = billing.get("config");
    GrokSubscription {
        availability: "available".to_string(),
        tier: billing
            .get("subscriptionTier")
            .and_then(Value::as_str)
            .map(str::to_string),
        credit_usage_percent: config
            .and_then(|value| value.get("creditUsagePercent"))
            .and_then(Value::as_f64),
        period_end: config
            .and_then(|value| {
                value
                    .pointer("/currentPeriod/end")
                    .or_else(|| value.get("billingPeriodEnd"))
            })
            .and_then(Value::as_str)
            .map(str::to_string),
        message: None,
    }
}

fn unsupported_subscription() -> GrokSubscription {
    GrokSubscription {
        availability: "unsupported".to_string(),
        tier: None,
        credit_usage_percent: None,
        period_end: None,
        message: Some(
            "登录已验证，但当前官方 Grok CLI 未开放套餐与额度查询；请在 SuperGrok 官方页面查看。"
                .to_string(),
        ),
    }
}

fn billing_method_unavailable(error: &str) -> bool {
    error.contains("-32601") || error.to_ascii_lowercase().contains("method not found")
}

fn grok_executable() -> Result<PathBuf, String> {
    if let Ok(path) = which::which("grok") {
        return Ok(path);
    }

    let executable_name = if cfg!(windows) { "grok.exe" } else { "grok" };
    let installed_path = dirs::home_dir()
        .map(|home| home.join(".grok").join("bin").join(executable_name))
        .filter(|path| path.is_file());

    installed_path.ok_or_else(|| {
        "Could not find the official `grok` executable. Install it from https://x.ai/cli."
            .to_string()
    })
}

fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(windows)]
fn normalize_proxy_endpoint(endpoint: &str) -> Option<String> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() || endpoint.chars().any(char::is_whitespace) {
        return None;
    }

    let lower = endpoint.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(endpoint.to_string());
    }
    if endpoint.contains("://") {
        return None;
    }

    Some(format!("http://{endpoint}"))
}

#[cfg(windows)]
fn proxy_url_from_windows_setting(setting: &str) -> Option<String> {
    let setting = setting.trim();
    if setting.is_empty() {
        return None;
    }

    if !setting.contains('=') {
        return normalize_proxy_endpoint(setting);
    }

    for preferred_protocol in ["https", "http"] {
        let endpoint = setting.split(';').find_map(|entry| {
            let (protocol, endpoint) = entry.split_once('=')?;
            protocol
                .trim()
                .eq_ignore_ascii_case(preferred_protocol)
                .then_some(endpoint)
        });
        if let Some(proxy) = endpoint.and_then(normalize_proxy_endpoint) {
            return Some(proxy);
        }
    }

    None
}

#[cfg(windows)]
fn windows_system_proxy() -> Option<String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let internet_settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled: u32 = internet_settings.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }

    let proxy_server: String = internet_settings.get_value("ProxyServer").ok()?;
    proxy_url_from_windows_setting(&proxy_server)
}

#[cfg(windows)]
fn apply_windows_system_proxy(command: &mut Command) -> bool {
    let Some(proxy) = windows_system_proxy() else {
        return false;
    };

    let mut applied = false;
    if std::env::var_os("HTTPS_PROXY").is_none() && std::env::var_os("https_proxy").is_none() {
        command
            .env("HTTPS_PROXY", &proxy)
            .env("https_proxy", &proxy);
        applied = true;
    }
    if std::env::var_os("HTTP_PROXY").is_none() && std::env::var_os("http_proxy").is_none() {
        command.env("HTTP_PROXY", &proxy).env("http_proxy", &proxy);
        applied = true;
    }

    applied
}

#[cfg(not(windows))]
fn apply_windows_system_proxy(_command: &mut Command) -> bool {
    false
}

fn login_url_from_output(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let candidate = &line[start..];
    let end = candidate
        .find(|character: char| character.is_whitespace() || character == '\u{1b}')
        .unwrap_or(candidate.len());
    let url = candidate[..end].trim_end_matches(|character| {
        matches!(
            character,
            '.' | ',' | ';' | ':' | ')' | ']' | '}' | '"' | '\''
        )
    });

    let endpoint = url.strip_prefix("https://")?;
    let host_end = endpoint.find(['/', '?', '#']).unwrap_or(endpoint.len());
    let host = &endpoint[..host_end];
    if !host.eq_ignore_ascii_case("auth.x.ai") && !host.eq_ignore_ascii_case("accounts.x.ai") {
        return None;
    }

    let path = endpoint[host_end..]
        .split(['?', '#'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_login_path = ["oauth", "authorize", "login", "sign-in", "signin", "device"]
        .iter()
        .any(|segment| path.contains(segment));
    if path.starts_with("/.well-known/") || !is_login_path {
        return None;
    }

    (!url.is_empty()).then(|| url.to_string())
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", url]);
        hide_console(&mut command);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(false)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the system browser: {error}"))
}

async fn forward_oauth_output<R>(reader: R, app: AppHandle, output_lines: Arc<Mutex<Vec<String>>>)
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit("grok://stderr", line.clone());
        output_lines.lock().await.push(line.clone());

        if login_url_from_output(&line).is_some() {
            let _ = app.emit("grok://status", "请在浏览器中完成 Grok 登录…");
        }
    }
}

fn oauth_failure_message(lines: &[String]) -> String {
    let detail = lines.iter().rev().find_map(|line| {
        let lower = line.to_ascii_lowercase();
        let looks_like_error = lower.contains("error")
            || lower.contains("failed")
            || lower.contains("could not")
            || lower.contains("cancel")
            || lower.contains("timed out");
        (looks_like_error && login_url_from_output(line).is_none()).then(|| line.trim().to_string())
    });

    detail.map_or_else(
        || "官方 Grok 登录没有完成。请重新尝试，并在浏览器中完成授权。".to_string(),
        |detail| format!("官方 Grok 登录没有完成：{detail}"),
    )
}

fn canonical_workspace(cwd: &str) -> Result<PathBuf, String> {
    let path = Path::new(cwd);
    path.canonicalize()
        .map_err(|error| format!("Workspace `{cwd}` is not accessible: {error}"))
}

fn detect_runtime() -> RuntimeStatus {
    let executable = grok_executable().ok();
    let version = executable.as_ref().and_then(|path| {
        let mut command = std::process::Command::new(path);
        command.arg("--version");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
    });
    let auth_path = dirs::home_dir().map(|home| home.join(".grok").join("auth.json"));

    RuntimeStatus {
        available: executable.is_some(),
        // GrokDesk only detects whether official CLI credentials are configured here.
        // Token validity is verified by the CLI itself when the ACP session starts.
        authentication_state: if auth_path.as_ref().is_some_and(|path| path.is_file()) {
            "configured".to_string()
        } else {
            "missing".to_string()
        },
        executable_path: executable.map(|path| path.to_string_lossy().into_owned()),
        version,
        auth_file_path: auth_path.map(|path| path.to_string_lossy().into_owned()),
    }
}

async fn wait_for_configured_credentials() -> bool {
    for _ in 0..20 {
        if detect_runtime().authentication_state == "configured" {
            return true;
        }
        sleep(Duration::from_millis(250)).await;
    }
    false
}

#[tauri::command]
pub async fn probe_runtime() -> RuntimeStatus {
    detect_runtime()
}

impl GrokBridge {
    async fn write_message(&self, message: &Value) -> Result<(), String> {
        let serialized = serde_json::to_string(message).map_err(|error| error.to_string())?;
        let mut stdin = self.stdin.lock().await;
        let writer = stdin
            .as_mut()
            .ok_or_else(|| "Grok Build ACP is not connected.".to_string())?;
        writer
            .write_all(format!("{serialized}\n").as_bytes())
            .await
            .map_err(|error| format!("Failed to write to Grok Build ACP: {error}"))?;
        writer
            .flush()
            .await
            .map_err(|error| format!("Failed to flush Grok Build ACP input: {error}"))
    }

    async fn request(
        &self,
        method: &str,
        params: Value,
        wait_for: Duration,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);

        let message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        if let Err(error) = self.write_message(&message).await {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }

        timeout(wait_for, receiver)
            .await
            .map_err(|_| format!("Grok Build ACP request `{method}` timed out."))?
            .map_err(|_| format!("Grok Build ACP request `{method}` was interrupted."))?
    }

    async fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        self.write_message(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }))
        .await
    }

    async fn stop(&self) -> Result<(), String> {
        self.stdin.lock().await.take();
        self.session_id.lock().await.take();

        if let Some(mut child) = self.child.lock().await.take() {
            child
                .kill()
                .await
                .map_err(|error| format!("Failed to stop Grok Build ACP: {error}"))?;
            let _ = child.wait().await;
        }

        let mut pending = self.pending.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err("Grok Build ACP stopped.".to_string()));
        }
        Ok(())
    }
}

async fn stdout_reader(
    stdout: tokio::process::ChildStdout,
    pending: Arc<Mutex<HashMap<u64, PendingResponse>>>,
    app: AppHandle,
) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            let _ = app.emit("grok://stderr", format!("[ACP] {line}"));
            continue;
        };

        let method = message.get("method").and_then(Value::as_str);
        let id = message.get("id").and_then(Value::as_u64);

        if method.is_none() {
            if let Some(id) = id {
                if let Some(sender) = pending.lock().await.remove(&id) {
                    let response = if let Some(error) = message.get("error") {
                        Err(error.to_string())
                    } else {
                        Ok(message.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = sender.send(response);
                }
            }
            continue;
        }

        let method = method.expect("checked above");
        if let Some(id) = id {
            let _ = app.emit(
                "grok://client-request",
                json!({
                    "id": id,
                    "method": method,
                    "params": message.get("params").cloned().unwrap_or_else(|| json!({})),
                }),
            );
        } else if method == "session/update" || method == "x.ai/session/update" {
            let _ = app.emit(
                "grok://session-update",
                message.get("params").cloned().unwrap_or(Value::Null),
            );
        } else {
            let _ = app.emit("grok://extension", message);
        }
    }

    let _ = app.emit("grok://status", "Grok Build · ACP disconnected");
}

async fn stderr_reader(stderr: tokio::process::ChildStderr, app: AppHandle) {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit("grok://stderr", line);
    }
}

fn session_start_request(
    workspace: &Path,
    resume_session_id: Option<&str>,
) -> (&'static str, Value) {
    if let Some(session_id) = resume_session_id {
        (
            "session/load",
            json!({
                "sessionId": session_id,
                "cwd": workspace.to_string_lossy(),
                "mcpServers": []
            }),
        )
    } else {
        (
            "session/new",
            json!({
                "cwd": workspace.to_string_lossy(),
                "mcpServers": []
            }),
        )
    }
}

#[tauri::command]
pub async fn start_acp_session(
    cwd: String,
    resume_session_id: Option<String>,
    app: AppHandle,
    bridge: State<'_, GrokBridge>,
) -> Result<String, String> {
    let resume_session_id = resume_session_id.filter(|session_id| !session_id.trim().is_empty());
    if let Some(session_id) = bridge.session_id.lock().await.clone() {
        if resume_session_id.as_deref() == Some(session_id.as_str()) {
            return Ok(session_id);
        }
    }

    let executable = grok_executable()?;
    let workspace = canonical_workspace(&cwd)?;
    bridge.stop().await?;

    let mut command = Command::new(executable);
    command
        .args(["agent", "--no-leader", "stdio"])
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    apply_windows_system_proxy(&mut command);
    hide_console(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start `grok agent stdio`: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Grok Build ACP did not expose stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Grok Build ACP did not expose stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Grok Build ACP did not expose stderr.".to_string())?;

    *bridge.stdin.lock().await = Some(stdin);
    *bridge.child.lock().await = Some(child);
    tokio::spawn(stdout_reader(stdout, bridge.pending.clone(), app.clone()));
    tokio::spawn(stderr_reader(stderr, app.clone()));

    let initialize = bridge
        .request(
            "initialize",
            json!({
                "protocolVersion": 1,
                "clientInfo": {
                    "name": "GrokDesk",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "clientCapabilities": {
                    "fs": { "readTextFile": false, "writeTextFile": false },
                    "terminal": false
                },
                "_meta": {
                    "clientType": "grok-desktop",
                    "clientVersion": env!("CARGO_PKG_VERSION"),
                    "startupHints": {
                        "nonInteractive": true,
                        "skipGitStatus": true,
                        "skipProjectLayout": true
                    }
                }
            }),
            Duration::from_secs(90),
        )
        .await;

    if let Err(error) = initialize {
        let _ = bridge.stop().await;
        return Err(error);
    }

    let (session_method, session_params) =
        session_start_request(&workspace, resume_session_id.as_deref());

    let session = bridge
        .request(session_method, session_params, Duration::from_secs(60))
        .await;

    let session = match session {
        Ok(session) => session,
        Err(error) => {
            let _ = bridge.stop().await;
            return Err(error);
        }
    };
    let session_id = if let Some(session_id) = resume_session_id {
        session_id
    } else {
        session
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| "Grok Build ACP did not return a sessionId.".to_string())?
            .to_string()
    };

    *bridge.session_id.lock().await = Some(session_id.clone());
    let _ = app.emit("grok://status", "Grok Build · ACP connected");
    Ok(session_id)
}

#[tauri::command]
pub async fn send_acp_prompt(
    text: String,
    app: AppHandle,
    bridge: State<'_, GrokBridge>,
) -> Result<(), String> {
    let session_id = bridge
        .session_id
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Start an ACP session before sending a prompt.".to_string())?;

    let response = bridge
        .request(
            "session/prompt",
            json!({
                "sessionId": session_id,
                "prompt": [{ "type": "text", "text": text }]
            }),
            Duration::from_secs(6 * 60 * 60),
        )
        .await?;

    let _ = app.emit("grok://turn-complete", response);
    Ok(())
}

#[tauri::command]
pub async fn cancel_acp_turn(bridge: State<'_, GrokBridge>) -> Result<(), String> {
    let session_id = bridge
        .session_id
        .lock()
        .await
        .clone()
        .ok_or_else(|| "No active ACP session.".to_string())?;
    bridge
        .notify("session/cancel", json!({ "sessionId": session_id }))
        .await
}

#[tauri::command]
pub async fn stop_acp_session(bridge: State<'_, GrokBridge>) -> Result<(), String> {
    bridge.stop().await
}

#[tauri::command]
pub async fn respond_to_client_request(
    id: u64,
    result: Value,
    bridge: State<'_, GrokBridge>,
) -> Result<(), String> {
    bridge
        .write_message(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        }))
        .await
}

#[tauri::command]
pub async fn start_oauth_login(app: AppHandle) -> Result<OAuthResult, String> {
    let executable = grok_executable()?;
    let mut command = Command::new(executable);
    command
        .args(["login", "--oauth"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);
    if apply_windows_system_proxy(&mut command) {
        let _ = app.emit(
            "grok://stderr",
            "[network] Using the active Windows system proxy for official Grok OAuth.",
        );
    }
    hide_console(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start official Grok OAuth: {error}"))?;

    let output_lines = Arc::new(Mutex::new(Vec::new()));

    let stdout_task = child.stdout.take().map(|stdout| {
        tokio::spawn(forward_oauth_output(
            stdout,
            app.clone(),
            output_lines.clone(),
        ))
    });
    let stderr_task = child.stderr.take().map(|stderr| {
        tokio::spawn(forward_oauth_output(
            stderr,
            app.clone(),
            output_lines.clone(),
        ))
    });

    let process_succeeded = child.wait().await.is_ok_and(|status| status.success());
    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }

    // The official CLI owns credential persistence. Wait briefly for its atomic
    // auth-file replacement to become visible before reporting the result.
    let credentials_created = wait_for_configured_credentials().await;
    let succeeded = process_succeeded && credentials_created;
    let message = if succeeded {
        let _ = app.emit("grok://status", "Grok 登录成功，正在刷新账号与订阅…");
        None
    } else {
        let _ = app.emit("grok://status", "Grok 登录未完成");
        Some(oauth_failure_message(&output_lines.lock().await))
    };

    Ok(OAuthResult { succeeded, message })
}

#[tauri::command]
pub async fn install_grok_cli(app: AppHandle) -> Result<RuntimeStatus, String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("One-click Grok Runtime installation currently supports Windows only.".to_string())
    }

    #[cfg(windows)]
    {
        let _ = app.emit("grok://status", "Installing official Grok Runtime…");
        let _ = app.emit(
            "grok://install-log",
            "[setup] Downloading the official installer from https://x.ai/cli/install.ps1",
        );

        let mut command = Command::new("powershell.exe");
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "$ProgressPreference='SilentlyContinue'; irm https://x.ai/cli/install.ps1 | iex",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        hide_console(&mut command);

        let mut child = command
            .spawn()
            .map_err(|error| format!("Failed to start the official Grok installer: {error}"))?;

        let stdout_task = child.stdout.take().map(|stdout| {
            let app = app.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = app.emit("grok://install-log", line);
                }
            })
        });
        let stderr_task = child.stderr.take().map(|stderr| {
            let app = app.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = app.emit("grok://install-log", line);
                }
            })
        });

        let status = child
            .wait()
            .await
            .map_err(|error| format!("The official Grok installer could not finish: {error}"))?;
        if let Some(task) = stdout_task {
            let _ = task.await;
        }
        if let Some(task) = stderr_task {
            let _ = task.await;
        }

        if !status.success() {
            let _ = app.emit("grok://status", "Grok Runtime installation failed");
            return Err(format!(
                "The official Grok installer exited with status {status}."
            ));
        }

        let runtime = detect_runtime();
        if !runtime.available {
            let _ = app.emit(
                "grok://status",
                "Grok Runtime was not detected after installation",
            );
            return Err(
                "The installer completed, but GrokDesk could not find ~/.grok/bin/grok.exe."
                    .to_string(),
            );
        }

        let _ = app.emit(
            "grok://install-log",
            "[setup] Official Grok Runtime is ready.",
        );
        let status = if runtime.authentication_state == "configured" {
            "Grok Build · OAuth configured"
        } else {
            "Grok Build · Sign in required"
        };
        let _ = app.emit("grok://status", status);
        Ok(runtime)
    }
}

#[tauri::command]
pub async fn fetch_grok_subscription(
    bridge: State<'_, GrokBridge>,
) -> Result<GrokSubscription, String> {
    if bridge.session_id.lock().await.is_none() {
        return Err("Connect the official Grok ACP session before checking billing.".to_string());
    }

    match bridge
        .request("x.ai/billing", json!({}), Duration::from_secs(30))
        .await
    {
        Ok(billing) => Ok(subscription_from_billing(&billing)),
        Err(error) if billing_method_unavailable(&error) => Ok(unsupported_subscription()),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn open_grok_subscription() -> Result<(), String> {
    const SUBSCRIPTION_URL: &str = "https://grok.com/supergrok?referrer=grok-build";
    open_external_url(SUBSCRIPTION_URL)
        .map_err(|error| format!("Could not open the official SuperGrok page: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_workspace_rejects_missing_paths() {
        let result = canonical_workspace("this/path/does/not/exist/grokdesk");
        assert!(result.is_err());
    }

    #[test]
    fn runtime_status_serializes_camel_case() {
        let value = serde_json::to_value(RuntimeStatus {
            available: true,
            authentication_state: "configured".to_string(),
            executable_path: Some("grok".to_string()),
            version: Some("grok 0.2.93".to_string()),
            auth_file_path: None,
        })
        .expect("runtime status should serialize");

        assert_eq!(value["executablePath"], "grok");
        assert_eq!(value["authenticationState"], "configured");
        assert!(value.get("executable_path").is_none());
    }

    #[test]
    fn subscription_serializes_billing_fields() {
        let value = serde_json::to_value(GrokSubscription {
            availability: "available".to_string(),
            tier: Some("SuperGrok".to_string()),
            credit_usage_percent: Some(42.5),
            period_end: Some("2026-08-01T00:00:00Z".to_string()),
            message: None,
        })
        .expect("subscription should serialize");

        assert_eq!(value["availability"], "available");
        assert_eq!(value["tier"], "SuperGrok");
        assert_eq!(value["creditUsagePercent"], 42.5);
        assert_eq!(value["periodEnd"], "2026-08-01T00:00:00Z");
    }

    #[test]
    fn subscription_projects_official_nested_billing_shape() {
        let subscription = subscription_from_billing(&json!({
            "subscriptionTier": "SuperGrok Heavy",
            "config": {
                "creditUsagePercent": 37.25,
                "currentPeriod": {
                    "end": "2026-08-08T00:00:00Z"
                }
            }
        }));

        assert_eq!(subscription.tier.as_deref(), Some("SuperGrok Heavy"));
        assert_eq!(subscription.credit_usage_percent, Some(37.25));
        assert_eq!(
            subscription.period_end.as_deref(),
            Some("2026-08-08T00:00:00Z")
        );
        assert_eq!(subscription.availability, "available");
        assert!(subscription.message.is_none());
    }

    #[test]
    fn reports_removed_billing_method_as_unsupported() {
        assert!(billing_method_unavailable(
            r#"{"code":-32601,"message":"Method not found"}"#
        ));

        let subscription = unsupported_subscription();
        assert_eq!(subscription.availability, "unsupported");
        assert!(subscription.tier.is_none());
        assert!(subscription
            .message
            .as_deref()
            .is_some_and(|message| message.contains("官方 Grok CLI")));
    }

    #[test]
    fn extracts_login_url_from_cli_output() {
        assert_eq!(
            login_url_from_output("Open this URL to sign in: https://auth.x.ai/oauth?state=test"),
            Some("https://auth.x.ai/oauth?state=test".to_string())
        );
        assert_eq!(
            login_url_from_output("\u{1b}[36mhttps://accounts.x.ai/login\u{1b}[0m"),
            Some("https://accounts.x.ai/login".to_string())
        );
        assert_eq!(
            login_url_from_output("Opening your browser to sign in"),
            None
        );
        assert_eq!(
            login_url_from_output("Ignore unrelated URL: https://example.com/login"),
            None
        );
        assert_eq!(
            login_url_from_output(
                "Error: error sending request for url (https://auth.x.ai/.well-known/openid-configuration): operation timed out"
            ),
            None
        );
    }

    #[cfg(windows)]
    #[test]
    fn normalizes_windows_system_proxy_settings() {
        assert_eq!(
            proxy_url_from_windows_setting("127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            proxy_url_from_windows_setting("http=127.0.0.1:8080;https=127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(proxy_url_from_windows_setting("socks=127.0.0.1:7891"), None);
    }

    #[test]
    fn creates_a_new_acp_session_request_without_a_saved_id() {
        let (method, params) = session_start_request(Path::new("C:/work/app"), None);

        assert_eq!(method, "session/new");
        assert_eq!(params["cwd"], "C:/work/app");
        assert!(params.get("sessionId").is_none());
    }

    #[test]
    fn loads_the_saved_acp_session_id() {
        let (method, params) = session_start_request(Path::new("C:/work/app"), Some("session-123"));

        assert_eq!(method, "session/load");
        assert_eq!(params["cwd"], "C:/work/app");
        assert_eq!(params["sessionId"], "session-123");
    }

    #[test]
    fn oauth_failure_prefers_actionable_cli_error() {
        let lines = vec![
            "Opening your browser to sign in".to_string(),
            "Authentication failed: request timed out".to_string(),
        ];

        assert_eq!(
            oauth_failure_message(&lines),
            "官方 Grok 登录没有完成：Authentication failed: request timed out"
        );
    }
}
