use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    time::timeout,
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
    tier: Option<String>,
    credit_usage_percent: Option<f64>,
    period_end: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthResult {
    succeeded: bool,
    message: Option<String>,
}

fn subscription_from_billing(billing: &Value) -> GrokSubscription {
    let config = billing.get("config");
    GrokSubscription {
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
    }
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

    let host = url
        .strip_prefix("https://")?
        .split(['/', '?', '#'])
        .next()?;
    if host != "auth.x.ai" && host != "accounts.x.ai" {
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

async fn forward_oauth_output<R>(
    reader: R,
    app: AppHandle,
    browser_opened: Arc<AtomicBool>,
    output_lines: Arc<Mutex<Vec<String>>>,
) where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit("grok://stderr", line.clone());
        output_lines.lock().await.push(line.clone());

        let Some(url) = login_url_from_output(&line) else {
            continue;
        };
        if browser_opened.swap(true, Ordering::AcqRel) {
            continue;
        }

        match open_external_url(&url) {
            Ok(()) => {
                let _ = app.emit("grok://status", "浏览器已打开，请完成 Grok 登录…");
            }
            Err(error) => {
                let _ = app.emit("grok://stderr", format!("[OAuth] {error}"));
            }
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

#[tauri::command]
pub async fn start_acp_session(
    cwd: String,
    app: AppHandle,
    bridge: State<'_, GrokBridge>,
) -> Result<String, String> {
    if let Some(session_id) = bridge.session_id.lock().await.clone() {
        return Ok(session_id);
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

    let session = bridge
        .request(
            "session/new",
            json!({
                "cwd": workspace.to_string_lossy(),
                "mcpServers": []
            }),
            Duration::from_secs(60),
        )
        .await;

    let session = match session {
        Ok(session) => session,
        Err(error) => {
            let _ = bridge.stop().await;
            return Err(error);
        }
    };
    let session_id = session
        .get("sessionId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Grok Build ACP did not return a sessionId.".to_string())?
        .to_string();

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
pub async fn start_oauth_login(app: AppHandle) -> Result<(), String> {
    let executable = grok_executable()?;
    let mut command = Command::new(executable);
    command
        .args(["login", "--oauth"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);
    hide_console(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start official Grok OAuth: {error}"))?;

    let browser_opened = Arc::new(AtomicBool::new(false));
    let output_lines = Arc::new(Mutex::new(Vec::new()));

    let stdout_task = child.stdout.take().map(|stdout| {
        tokio::spawn(forward_oauth_output(
            stdout,
            app.clone(),
            browser_opened.clone(),
            output_lines.clone(),
        ))
    });
    let stderr_task = child.stderr.take().map(|stderr| {
        tokio::spawn(forward_oauth_output(
            stderr,
            app.clone(),
            browser_opened,
            output_lines.clone(),
        ))
    });

    tokio::spawn(async move {
        let process_succeeded = child.wait().await.is_ok_and(|status| status.success());
        if let Some(task) = stdout_task {
            let _ = task.await;
        }
        if let Some(task) = stderr_task {
            let _ = task.await;
        }

        let credentials_created = detect_runtime().authentication_state == "configured";
        let succeeded = process_succeeded && credentials_created;
        let message = if succeeded {
            None
        } else {
            Some(oauth_failure_message(&output_lines.lock().await))
        };
        let _ = app.emit("grok://auth-complete", OAuthResult { succeeded, message });
    });

    Ok(())
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

    let billing = bridge
        .request("x.ai/billing", json!({}), Duration::from_secs(30))
        .await?;

    Ok(subscription_from_billing(&billing))
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
            tier: Some("SuperGrok".to_string()),
            credit_usage_percent: Some(42.5),
            period_end: Some("2026-08-01T00:00:00Z".to_string()),
        })
        .expect("subscription should serialize");

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
