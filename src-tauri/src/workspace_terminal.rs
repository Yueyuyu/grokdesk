use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, process::Stdio, time::Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::{Child, Command},
    sync::{watch, Mutex},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_COMMAND_CHARS: usize = 4_096;
const MAX_OUTPUT_LINE_CHARS: usize = 16_384;
const MAX_CONCURRENT_COMMANDS: usize = 8;

#[derive(Default)]
pub struct WorkspaceTerminal {
    running: Mutex<HashMap<String, watch::Sender<bool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCommandOutput {
    command_id: String,
    stream: &'static str,
    line: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCommandResult {
    command_id: String,
    exit_code: Option<i32>,
    cancelled: bool,
    duration_ms: u64,
}

fn canonical_workspace(cwd: &str) -> Result<PathBuf, String> {
    let raw = cwd.trim();
    if raw.is_empty() {
        return Err("Choose a workspace before running a command.".to_string());
    }

    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err("The workspace path must be absolute.".to_string());
    }

    let canonical = std::fs::canonicalize(&path)
        .map_err(|error| format!("Cannot open workspace `{raw}`: {error}"))?;
    if !canonical.is_dir() {
        return Err("The selected workspace is not a directory.".to_string());
    }
    Ok(canonical)
}

fn validated_command(command_line: &str) -> Result<String, String> {
    let command = command_line.trim();
    if command.is_empty() {
        return Err("Enter a command to run.".to_string());
    }
    if command.chars().count() > MAX_COMMAND_CHARS {
        return Err(format!(
            "Commands are limited to {MAX_COMMAND_CHARS} characters."
        ));
    }
    Ok(command.to_string())
}

fn validated_command_id(command_id: &str) -> Result<String, String> {
    let value = command_id.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("The workspace command identifier is invalid.".to_string());
    }
    Ok(value.to_string())
}

fn reserve_running_command(
    running: &mut HashMap<String, watch::Sender<bool>>,
    command_id: &str,
    cancel: watch::Sender<bool>,
) -> Result<(), String> {
    if running.contains_key(command_id) {
        return Err("The workspace command identifier is already running.".to_string());
    }
    if running.len() >= MAX_CONCURRENT_COMMANDS {
        return Err(format!(
            "Up to {MAX_CONCURRENT_COMMANDS} workspace commands can run at once."
        ));
    }
    running.insert(command_id.to_string(), cancel);
    Ok(())
}

fn truncate_output_line(line: &str) -> String {
    if line.chars().count() <= MAX_OUTPUT_LINE_CHARS {
        return line.to_string();
    }

    let mut truncated = line.chars().take(MAX_OUTPUT_LINE_CHARS).collect::<String>();
    truncated.push_str(" … [line truncated]");
    truncated
}

#[cfg(windows)]
fn shell_command(workspace: &PathBuf, command_line: &str) -> Command {
    let mut command = Command::new("powershell.exe");
    let script = format!(
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); \
         $ProgressPreference = 'SilentlyContinue'; \
         & {{ {command_line} }}; \
         $grokdeskSucceeded = $?; \
         $grokdeskExit = $LASTEXITCODE; \
         if ($null -ne $grokdeskExit) {{ exit $grokdeskExit }}; \
         if (-not $grokdeskSucceeded) {{ exit 1 }}"
    );

    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(windows))]
fn shell_command(workspace: &PathBuf, command_line: &str) -> Command {
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/sh".into());
    let mut command = Command::new(shell);
    command
        .args(["-lc", command_line])
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    command
}

async fn forward_output<R>(reader: R, app: AppHandle, command_id: String, stream: &'static str)
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let _ = app.emit(
                    "workspace-command-output",
                    WorkspaceCommandOutput {
                        command_id: command_id.clone(),
                        stream,
                        line: truncate_output_line(&line),
                    },
                );
            }
            Ok(None) => break,
            Err(error) => {
                let _ = app.emit(
                    "workspace-command-output",
                    WorkspaceCommandOutput {
                        command_id: command_id.clone(),
                        stream: "system",
                        line: format!("Could not read {stream}: {error}"),
                    },
                );
                break;
            }
        }
    }
}

#[cfg(windows)]
async fn terminate_process_tree(child: &mut Child) {
    if let Some(pid) = child.id() {
        let mut taskkill = Command::new("taskkill.exe");
        taskkill
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        taskkill.as_std_mut().creation_flags(CREATE_NO_WINDOW);
        if taskkill
            .status()
            .await
            .map(|status| status.success())
            .unwrap_or(false)
        {
            return;
        }
    }
    let _ = child.kill().await;
}

#[cfg(not(windows))]
async fn terminate_process_tree(child: &mut Child) {
    let _ = child.kill().await;
}

async fn execute_command(
    app: AppHandle,
    workspace: PathBuf,
    command_line: String,
    command_id: String,
    mut cancel: watch::Receiver<bool>,
) -> Result<WorkspaceCommandResult, String> {
    let started = Instant::now();
    let mut child = shell_command(&workspace, &command_line)
        .spawn()
        .map_err(|error| format!("Could not start PowerShell: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "PowerShell stdout is unavailable.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "PowerShell stderr is unavailable.".to_string())?;

    // 两个管道必须并行读取，否则大量输出可能填满缓冲区并阻塞子进程。
    let stdout_task = tokio::spawn(forward_output(
        stdout,
        app.clone(),
        command_id.clone(),
        "stdout",
    ));
    let stderr_task = tokio::spawn(forward_output(stderr, app, command_id.clone(), "stderr"));

    let mut cancelled = false;
    let status = tokio::select! {
        result = child.wait() => {
            result.map_err(|error| format!("Could not wait for PowerShell: {error}"))?
        }
        changed = cancel.changed() => {
            if changed.is_ok() && *cancel.borrow() {
                cancelled = true;
                terminate_process_tree(&mut child).await;
            }
            child.wait().await.map_err(|error| format!("Could not stop PowerShell: {error}"))?
        }
    };

    let _ = stdout_task.await;
    let _ = stderr_task.await;

    Ok(WorkspaceCommandResult {
        command_id,
        exit_code: status.code(),
        cancelled,
        duration_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
    })
}

#[tauri::command]
pub async fn run_workspace_command(
    app: AppHandle,
    terminal: State<'_, WorkspaceTerminal>,
    cwd: String,
    command_line: String,
    command_id: String,
) -> Result<WorkspaceCommandResult, String> {
    let workspace = canonical_workspace(&cwd)?;
    let command_line = validated_command(&command_line)?;
    let command_id = validated_command_id(&command_id)?;
    let (cancel_sender, cancel_receiver) = watch::channel(false);

    {
        let mut running = terminal.running.lock().await;
        reserve_running_command(&mut running, &command_id, cancel_sender)?;
    }

    let result = execute_command(
        app,
        workspace,
        command_line,
        command_id.clone(),
        cancel_receiver,
    )
    .await;

    let mut running = terminal.running.lock().await;
    running.remove(&command_id);
    result
}

#[tauri::command]
pub async fn cancel_workspace_command(
    terminal: State<'_, WorkspaceTerminal>,
    command_id: String,
) -> Result<(), String> {
    let command_id = validated_command_id(&command_id)?;
    let cancel = {
        let running = terminal.running.lock().await;
        running.get(&command_id).cloned()
    };
    let Some(cancel) = cancel else {
        return Err("The requested workspace command is no longer running.".to_string());
    };
    cancel
        .send(true)
        .map_err(|_| "The workspace command already finished.".to_string())
}

#[cfg(test)]
fn test_cancel_sender() -> watch::Sender<bool> {
    let (sender, _receiver) = watch::channel(false);
    sender
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_command_and_identifier_limits() {
        assert_eq!(validated_command("  npm test  ").unwrap(), "npm test");
        assert!(validated_command("   ").is_err());
        assert!(validated_command_id("terminal-123").is_ok());
        assert!(validated_command_id("terminal/123").is_err());
    }

    #[test]
    fn reserves_independent_commands_and_rejects_duplicates() {
        let mut running = HashMap::new();
        reserve_running_command(&mut running, "command-1", test_cancel_sender()).unwrap();
        reserve_running_command(&mut running, "command-2", test_cancel_sender()).unwrap();
        assert_eq!(running.len(), 2);
        assert!(reserve_running_command(&mut running, "command-1", test_cancel_sender()).is_err());
    }

    #[test]
    fn enforces_the_terminal_tab_concurrency_limit() {
        let mut running = HashMap::new();
        for index in 0..MAX_CONCURRENT_COMMANDS {
            reserve_running_command(
                &mut running,
                &format!("command-{index}"),
                test_cancel_sender(),
            )
            .unwrap();
        }
        assert!(
            reserve_running_command(&mut running, "command-overflow", test_cancel_sender())
                .is_err()
        );
    }

    #[test]
    fn truncates_single_unbounded_output_lines() {
        let input = "x".repeat(MAX_OUTPUT_LINE_CHARS + 12);
        let output = truncate_output_line(&input);
        assert!(output.ends_with("[line truncated]"));
        assert!(output.len() < input.len() + 32);
    }
}
