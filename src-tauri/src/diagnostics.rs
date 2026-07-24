use crate::{
    grok_bridge::detect_runtime, runtime_extensions::list_grok_mcp_servers,
    workspace::inspect_workspace,
};
use serde::Serialize;
use std::{fs, path::Path};

const MAX_DIAGNOSTIC_REPORT_BYTES: usize = 512 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum DiagnosticStatus {
    Healthy,
    Attention,
    Blocked,
    Info,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum DiagnosticActionKind {
    InstallRuntime,
    SignIn,
    ChooseWorkspace,
    ConnectAcp,
    OpenMcp,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticAction {
    kind: DiagnosticActionKind,
    label: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticCheck {
    id: String,
    category: String,
    title: String,
    status: DiagnosticStatus,
    summary: String,
    detail: String,
    action: Option<DiagnosticAction>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    app_version: String,
    platform: String,
    runtime_version: Option<String>,
    workspace_selected: bool,
    checks: Vec<DiagnosticCheck>,
}

impl DiagnosticAction {
    fn new(kind: DiagnosticActionKind, label: &str) -> Self {
        Self {
            kind,
            label: label.to_string(),
        }
    }
}

impl DiagnosticCheck {
    fn new(
        id: &str,
        category: &str,
        title: &str,
        status: DiagnosticStatus,
        summary: impl Into<String>,
        detail: impl Into<String>,
        action: Option<DiagnosticAction>,
    ) -> Self {
        Self {
            id: id.to_string(),
            category: category.to_string(),
            title: title.to_string(),
            status,
            summary: summary.into(),
            detail: detail.into(),
            action,
        }
    }
}

fn mcp_status_needs_attention(status: Option<&str>) -> bool {
    let status = status.unwrap_or_default().to_ascii_lowercase();
    ["error", "fail", "unhealthy", "disconnected", "stopped"]
        .iter()
        .any(|keyword| status.contains(keyword))
}

fn validate_report_path(path: &Path) -> Result<(), String> {
    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    if !is_markdown {
        return Err("Diagnostic reports must use the .md extension.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn run_diagnostics(cwd: Option<String>, acp_connected: bool) -> DiagnosticReport {
    let runtime = detect_runtime();
    let selected_workspace = cwd
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty() && value.trim() != ".");
    let mut workspace_accessible = false;
    let mut checks = vec![DiagnosticCheck::new(
        "native-shell",
        "app",
        "GrokDesk native shell",
        DiagnosticStatus::Healthy,
        format!("GrokDesk v{} is responding.", env!("CARGO_PKG_VERSION")),
        "The diagnostics command completed inside the installed Tauri application.",
        None,
    )];
    checks.push(DiagnosticCheck::new(
        "signed-updater",
        "app",
        "Signed application updates",
        DiagnosticStatus::Healthy,
        "The desktop updater is configured with GrokDesk's dedicated public key.",
        "Update metadata may be checked automatically. Download, installation, and restart still require explicit confirmation.",
        None,
    ));

    checks.push(if !runtime.available {
        DiagnosticCheck::new(
            "runtime",
            "runtime",
            "Official Grok Runtime",
            DiagnosticStatus::Blocked,
            "The official grok executable was not found.",
            "Install the official Runtime before using OAuth, ACP, plugins, or MCP.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::InstallRuntime,
                "Install Runtime",
            )),
        )
    } else if runtime.version.is_none() {
        DiagnosticCheck::new(
            "runtime",
            "runtime",
            "Official Grok Runtime",
            DiagnosticStatus::Attention,
            "The grok executable exists, but its version could not be read.",
            "Update the official Runtime, then run diagnostics again.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::InstallRuntime,
                "Update Runtime",
            )),
        )
    } else {
        DiagnosticCheck::new(
            "runtime",
            "runtime",
            "Official Grok Runtime",
            DiagnosticStatus::Healthy,
            runtime
                .version
                .clone()
                .unwrap_or_else(|| "Runtime detected".to_string()),
            "The executable was discovered through the supported Runtime lookup.",
            None,
        )
    });

    checks.push(if !runtime.available {
        DiagnosticCheck::new(
            "credentials",
            "account",
            "Official OAuth credentials",
            DiagnosticStatus::Blocked,
            "Credentials cannot be checked until the Runtime is installed.",
            "GrokDesk delegates authentication to the official grok login --oauth flow.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::InstallRuntime,
                "Install Runtime",
            )),
        )
    } else if runtime.authentication_state == "missing" {
        DiagnosticCheck::new(
            "credentials",
            "account",
            "Official OAuth credentials",
            DiagnosticStatus::Blocked,
            "No official Grok credentials are configured.",
            "Sign in through the official browser OAuth flow. GrokDesk never reads or stores the token.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::SignIn,
                "Sign in",
            )),
        )
    } else if acp_connected {
        DiagnosticCheck::new(
            "credentials",
            "account",
            "Official OAuth credentials",
            DiagnosticStatus::Healthy,
            "The active ACP session accepted the configured credentials.",
            "Credential validity is proven by the official Runtime session, not by reading token contents.",
            None,
        )
    } else {
        DiagnosticCheck::new(
            "credentials",
            "account",
            "Official OAuth credentials",
            DiagnosticStatus::Attention,
            "Official credentials are configured but not verified in this app session.",
            "Connect ACP to let the official Runtime verify the current login.",
            Some(DiagnosticAction::new(
                if selected_workspace {
                    DiagnosticActionKind::ConnectAcp
                } else {
                    DiagnosticActionKind::ChooseWorkspace
                },
                if selected_workspace {
                    "Connect ACP"
                } else {
                    "Choose workspace"
                },
            )),
        )
    });

    let workspace_check = if !selected_workspace {
        DiagnosticCheck::new(
            "workspace",
            "workspace",
            "Workspace access",
            DiagnosticStatus::Blocked,
            "No project folder is selected.",
            "Choose a folder before starting ACP or inspecting Git changes.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::ChooseWorkspace,
                "Choose workspace",
            )),
        )
    } else {
        match inspect_workspace(cwd.clone().unwrap_or_default()) {
            Ok(snapshot) if snapshot.mode == "git" => {
                workspace_accessible = true;
                DiagnosticCheck::new(
                    "workspace",
                    "workspace",
                    "Workspace & Git",
                    DiagnosticStatus::Healthy,
                    "The selected folder is accessible and belongs to a Git repository.",
                    format!(
                        "Git reported {} changed file(s). No file contents were read for this check.",
                        snapshot.changes.len()
                    ),
                    None,
                )
            }
            Ok(snapshot) if snapshot.mode == "not_git" => {
                workspace_accessible = true;
                DiagnosticCheck::new(
                    "workspace",
                    "workspace",
                    "Workspace & Git",
                    DiagnosticStatus::Attention,
                    "The selected folder is accessible, but it is not a Git repository.",
                    "Chat can still work, while Changes review and Git-aware workflows remain unavailable.",
                    Some(DiagnosticAction::new(
                        DiagnosticActionKind::ChooseWorkspace,
                        "Choose another folder",
                    )),
                )
            }
            Ok(_) => DiagnosticCheck::new(
                "workspace",
                "workspace",
                "Workspace access",
                DiagnosticStatus::Blocked,
                "The selected workspace could not be inspected.",
                "Choose the project folder again, then rerun diagnostics.",
                Some(DiagnosticAction::new(
                    DiagnosticActionKind::ChooseWorkspace,
                    "Choose workspace",
                )),
            ),
            Err(_) => DiagnosticCheck::new(
                "workspace",
                "workspace",
                "Workspace access",
                DiagnosticStatus::Blocked,
                "The selected workspace or Git installation could not be inspected.",
                "Confirm that the folder still exists and Git is available, then rerun diagnostics.",
                Some(DiagnosticAction::new(
                    DiagnosticActionKind::ChooseWorkspace,
                    "Choose workspace",
                )),
            ),
        }
    };
    checks.push(workspace_check);

    checks.push(if acp_connected {
        DiagnosticCheck::new(
            "acp",
            "acp",
            "ACP session",
            DiagnosticStatus::Healthy,
            "The desktop client is connected to grok agent stdio.",
            "Prompts and streamed updates can use the active official Runtime session.",
            None,
        )
    } else if !runtime.available {
        DiagnosticCheck::new(
            "acp",
            "acp",
            "ACP session",
            DiagnosticStatus::Blocked,
            "ACP cannot start because the official Runtime is missing.",
            "Install the Runtime first.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::InstallRuntime,
                "Install Runtime",
            )),
        )
    } else if runtime.authentication_state == "missing" {
        DiagnosticCheck::new(
            "acp",
            "acp",
            "ACP session",
            DiagnosticStatus::Blocked,
            "ACP cannot start until Grok OAuth is configured.",
            "Complete the official browser sign-in flow first.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::SignIn,
                "Sign in",
            )),
        )
    } else if !workspace_accessible {
        DiagnosticCheck::new(
            "acp",
            "acp",
            "ACP session",
            DiagnosticStatus::Blocked,
            "ACP needs an accessible project folder.",
            "Choose a workspace before connecting the official agent.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::ChooseWorkspace,
                "Choose workspace",
            )),
        )
    } else {
        DiagnosticCheck::new(
            "acp",
            "acp",
            "ACP session",
            DiagnosticStatus::Attention,
            "The official Runtime is ready, but ACP is not connected.",
            "Connect ACP to verify credentials and start a real Grok Build session.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::ConnectAcp,
                "Connect ACP",
            )),
        )
    });

    let mcp_check = if !runtime.available {
        DiagnosticCheck::new(
            "mcp",
            "mcp",
            "MCP configuration",
            DiagnosticStatus::Blocked,
            "MCP configuration cannot be read without the official Runtime.",
            "Install the Runtime, then rerun diagnostics.",
            Some(DiagnosticAction::new(
                DiagnosticActionKind::InstallRuntime,
                "Install Runtime",
            )),
        )
    } else {
        let diagnostic_cwd = workspace_accessible.then(|| cwd.clone().unwrap_or_default());
        match list_grok_mcp_servers(diagnostic_cwd).await {
            Ok(catalog) if catalog.servers.is_empty() => DiagnosticCheck::new(
                "mcp",
                "mcp",
                "MCP configuration",
                DiagnosticStatus::Info,
                "No MCP servers were returned by the official Runtime.",
                "MCP is optional. Add a server only when a workflow requires one.",
                Some(DiagnosticAction::new(
                    DiagnosticActionKind::OpenMcp,
                    "Open MCP",
                )),
            ),
            Ok(catalog) => {
                let total = catalog.servers.len();
                let disabled = catalog.servers.iter().filter(|server| !server.enabled).count();
                let unhealthy = catalog
                    .servers
                    .iter()
                    .filter(|server| mcp_status_needs_attention(server.status.as_deref()))
                    .count();
                if disabled > 0 || unhealthy > 0 {
                    DiagnosticCheck::new(
                        "mcp",
                        "mcp",
                        "MCP configuration",
                        DiagnosticStatus::Attention,
                        format!(
                            "The Runtime returned {total} MCP server(s); {disabled} disabled and {unhealthy} reporting an unhealthy status."
                        ),
                        "Open MCP to inspect the named server records and run the Runtime-provided diagnosis.",
                        Some(DiagnosticAction::new(
                            DiagnosticActionKind::OpenMcp,
                            "Open MCP",
                        )),
                    )
                } else {
                    DiagnosticCheck::new(
                        "mcp",
                        "mcp",
                        "MCP configuration",
                        DiagnosticStatus::Healthy,
                        format!("The official Runtime returned {total} enabled MCP server(s)."),
                        "Only Runtime-reported status and aggregate counts were used; credentials and server names are excluded.",
                        Some(DiagnosticAction::new(
                            DiagnosticActionKind::OpenMcp,
                            "Review MCP",
                        )),
                    )
                }
            }
            Err(_) => DiagnosticCheck::new(
                "mcp",
                "mcp",
                "MCP configuration",
                DiagnosticStatus::Attention,
                "The official Runtime did not return an MCP inventory.",
                "Update the Runtime or open MCP to retry. Raw CLI errors are excluded from the report.",
                Some(DiagnosticAction::new(
                    DiagnosticActionKind::OpenMcp,
                    "Open MCP",
                )),
            ),
        }
    };
    checks.push(mcp_check);

    DiagnosticReport {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: format!("{} / {}", std::env::consts::OS, std::env::consts::ARCH),
        runtime_version: runtime.version,
        workspace_selected: selected_workspace,
        checks,
    }
}

#[tauri::command]
pub fn write_diagnostic_report(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    validate_report_path(path)?;
    if content.len() > MAX_DIAGNOSTIC_REPORT_BYTES {
        return Err("The diagnostic report exceeds the 512 KiB safety limit.".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "The selected report location is invalid.".to_string())?;
    if !parent.is_dir() {
        return Err("The selected report folder does not exist.".to_string());
    }
    fs::write(path, content).map_err(|_| "Unable to write the diagnostic report.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_only_explicit_mcp_failure_states_as_attention() {
        assert!(mcp_status_needs_attention(Some("connection failed")));
        assert!(mcp_status_needs_attention(Some("UNHEALTHY")));
        assert!(!mcp_status_needs_attention(Some("connected")));
        assert!(!mcp_status_needs_attention(None));
    }

    #[test]
    fn diagnostic_exports_require_markdown_paths() {
        assert!(validate_report_path(Path::new("grokdesk-diagnostics.md")).is_ok());
        assert!(validate_report_path(Path::new("GROKDESK.MD")).is_ok());
        assert!(validate_report_path(Path::new("diagnostics.json")).is_err());
        assert!(validate_report_path(Path::new("diagnostics")).is_err());
    }
}
