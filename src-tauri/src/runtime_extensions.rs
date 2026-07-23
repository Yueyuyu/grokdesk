use crate::grok_bridge::{
    apply_windows_system_proxy, canonical_workspace, grok_executable, hide_console,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{process::Stdio, time::Duration};
use tokio::{process::Command, time::timeout};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokPluginSummary {
    status: String,
    name: String,
    version: Option<String>,
    description: Option<String>,
    marketplace: Option<String>,
    scope: Option<String>,
    path: Option<String>,
    enabled: bool,
    trusted: Option<bool>,
    skill_count: usize,
    command_count: usize,
    agent_count: usize,
    hook_count: usize,
    mcp_server_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokPluginCatalog {
    plugins: Vec<GrokPluginSummary>,
    marketplace_available: bool,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokMcpServerSummary {
    name: String,
    transport: String,
    scope: Option<String>,
    endpoint: Option<String>,
    pub(crate) enabled: bool,
    pub(crate) status: Option<String>,
    source: Option<String>,
    tool_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokMcpCatalog {
    pub(crate) servers: Vec<GrokMcpServerSummary>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCommandResult {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMcpServerInput {
    name: String,
    transport: String,
    scope: String,
    target: String,
    #[serde(default)]
    args: Vec<String>,
}

fn value_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn value_count(value: &Value, array_pointer: &str, count_pointers: &[&str]) -> usize {
    if let Some(items) = value.pointer(array_pointer).and_then(Value::as_array) {
        return items.len();
    }

    count_pointers
        .iter()
        .find_map(|pointer| value.pointer(pointer).and_then(Value::as_u64))
        .unwrap_or_default() as usize
}

fn plugin_summary(value: &Value) -> Option<GrokPluginSummary> {
    let name = value_string(value, &["/name"])?;
    let status = value_string(value, &["/status"]).unwrap_or_else(|| "installed".to_string());
    let enabled = value
        .pointer("/enabled")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| status != "disabled" && status != "available");

    Some(GrokPluginSummary {
        status,
        name,
        version: value_string(value, &["/version"]),
        description: value_string(value, &["/description"]),
        marketplace: value_string(value, &["/marketplace"]),
        scope: value_string(value, &["/scope"]),
        path: value_string(value, &["/path"]),
        enabled,
        trusted: value.pointer("/trusted").and_then(Value::as_bool),
        skill_count: value_count(
            value,
            "/components/skills",
            &["/skill_count", "/skillCount"],
        ),
        command_count: value_count(
            value,
            "/components/commands",
            &["/command_count", "/commandCount"],
        ),
        agent_count: value_count(
            value,
            "/components/agents",
            &["/agent_count", "/agentCount"],
        ),
        hook_count: value_count(value, "/components/hooks", &["/hook_count", "/hookCount"]),
        mcp_server_count: value_count(
            value,
            "/components/mcpServers",
            &["/mcp_server_count", "/mcpServerCount"],
        ),
    })
}

fn json_items<'a>(value: &'a Value, collection_keys: &[&str]) -> &'a [Value] {
    if let Some(items) = value.as_array() {
        return items;
    }

    collection_keys
        .iter()
        .find_map(|key| value.get(key).and_then(Value::as_array))
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn mcp_server_summary(value: &Value) -> Option<GrokMcpServerSummary> {
    let name = value_string(value, &["/name", "/id"])?;
    let url = value_string(value, &["/url", "/transport/url"]);
    let command = value_string(value, &["/command", "/transport/command"]);
    let transport = value_string(value, &["/transport/type", "/transport", "/type"])
        .unwrap_or_else(|| {
            if url.is_some() {
                "http".to_string()
            } else {
                "stdio".to_string()
            }
        });

    Some(GrokMcpServerSummary {
        name,
        transport,
        scope: value_string(value, &["/scope"]),
        endpoint: url.or(command),
        enabled: value
            .pointer("/enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        status: value_string(value, &["/status", "/health/status"]),
        source: value_string(value, &["/source", "/origin"]),
        tool_count: value_count(value, "/tools", &["/tool_count", "/toolCount"]),
    })
}

fn validate_runtime_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    let valid = !value.is_empty()
        && value.len() <= 128
        && !value.starts_with('-')
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(value.to_string())
    } else {
        Err("Names may contain only letters, numbers, hyphens, and underscores.".to_string())
    }
}

fn validate_plugin_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    let valid = !value.is_empty()
        && value.len() <= 300
        && !value.starts_with('-')
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '-' | '_' | '.' | '/' | ':' | '@')
        });
    if valid {
        Ok(value.to_string())
    } else {
        Err("The plugin name contains unsupported characters.".to_string())
    }
}

fn validate_cli_value(value: &str, label: &str, maximum_length: usize) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > maximum_length || value.chars().any(char::is_control) {
        return Err(format!("{label} is empty or invalid."));
    }
    if value.starts_with('-') {
        return Err(format!("{label} cannot start with a hyphen."));
    }
    Ok(value.to_string())
}

pub(crate) fn parse_cli_json(output: &str, label: &str) -> Result<Value, String> {
    serde_json::from_str(output)
        .map_err(|error| format!("Official Grok CLI returned invalid {label} data: {error}"))
}

fn compact_cli_error(stderr: &[u8]) -> String {
    String::from_utf8_lossy(stderr)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("The official Grok CLI command failed.")
        .chars()
        .take(1_200)
        .collect()
}

pub(crate) async fn run_grok_cli(
    cwd: Option<&str>,
    args: &[String],
    wait_for: Duration,
) -> Result<String, String> {
    let executable = grok_executable()?;
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) {
        command.current_dir(canonical_workspace(cwd)?);
    }
    apply_windows_system_proxy(&mut command);
    hide_console(&mut command);

    let output = timeout(wait_for, command.output())
        .await
        .map_err(|_| "The official Grok CLI command timed out.".to_string())?
        .map_err(|error| format!("Could not run the official Grok CLI: {error}"))?;
    if !output.status.success() {
        return Err(compact_cli_error(&output.stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn list_grok_plugins(cwd: Option<String>) -> Result<GrokPluginCatalog, String> {
    let available_args = ["plugin", "list", "--json", "--available"]
        .map(str::to_string)
        .to_vec();
    let (output, marketplace_available, message) =
        match run_grok_cli(cwd.as_deref(), &available_args, Duration::from_secs(90)).await {
            Ok(output) => (output, true, None),
            Err(_) => {
                let installed_args = ["plugin", "list", "--json"].map(str::to_string).to_vec();
                let output =
                    run_grok_cli(cwd.as_deref(), &installed_args, Duration::from_secs(30)).await?;
                (
                output,
                false,
                Some(
                    "Marketplace data could not be refreshed; installed plugins are still shown."
                        .to_string(),
                ),
            )
            }
        };
    let value = parse_cli_json(&output, "plugin")?;
    let plugins = json_items(&value, &["plugins"])
        .iter()
        .filter_map(plugin_summary)
        .collect();

    Ok(GrokPluginCatalog {
        plugins,
        marketplace_available,
        message,
    })
}

#[tauri::command]
pub async fn install_grok_plugin(
    cwd: Option<String>,
    source: String,
    trusted: bool,
) -> Result<RuntimeCommandResult, String> {
    if !trusted {
        return Err(
            "Installing a plugin requires explicit confirmation that the source is trusted."
                .to_string(),
        );
    }
    let source = validate_cli_value(&source, "Plugin source", 4_000)?;
    let args = vec![
        "plugin".to_string(),
        "install".to_string(),
        "--trust".to_string(),
        "--".to_string(),
        source,
    ];
    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(5 * 60)).await?;
    Ok(RuntimeCommandResult {
        message: "Plugin installed from the trusted source.".to_string(),
    })
}

#[tauri::command]
pub async fn set_grok_plugin_enabled(
    cwd: Option<String>,
    name: String,
    enabled: bool,
) -> Result<RuntimeCommandResult, String> {
    let name = validate_plugin_name(&name)?;
    let args = vec![
        "plugin".to_string(),
        if enabled { "enable" } else { "disable" }.to_string(),
        "--".to_string(),
        name.clone(),
    ];
    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(60)).await?;
    Ok(RuntimeCommandResult {
        message: format!(
            "Plugin {name} {}.",
            if enabled { "enabled" } else { "disabled" }
        ),
    })
}

#[tauri::command]
pub async fn update_grok_plugin(
    cwd: Option<String>,
    name: String,
) -> Result<RuntimeCommandResult, String> {
    let name = validate_plugin_name(&name)?;
    let args = vec![
        "plugin".to_string(),
        "update".to_string(),
        "--".to_string(),
        name.clone(),
    ];
    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(5 * 60)).await?;
    Ok(RuntimeCommandResult {
        message: format!("Plugin {name} updated."),
    })
}

#[tauri::command]
pub async fn uninstall_grok_plugin(
    cwd: Option<String>,
    name: String,
    keep_data: bool,
) -> Result<RuntimeCommandResult, String> {
    let name = validate_plugin_name(&name)?;
    let mut args = vec![
        "plugin".to_string(),
        "uninstall".to_string(),
        "--confirm".to_string(),
    ];
    if keep_data {
        args.push("--keep-data".to_string());
    }
    args.extend(["--".to_string(), name.clone()]);
    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(2 * 60)).await?;
    Ok(RuntimeCommandResult {
        message: format!("Plugin {name} uninstalled."),
    })
}

#[tauri::command]
pub async fn refresh_grok_plugin_marketplaces(
    cwd: Option<String>,
) -> Result<RuntimeCommandResult, String> {
    let args = ["plugin", "marketplace", "update"]
        .map(str::to_string)
        .to_vec();
    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(5 * 60)).await?;
    Ok(RuntimeCommandResult {
        message: "Plugin marketplaces refreshed.".to_string(),
    })
}

#[tauri::command]
pub async fn list_grok_mcp_servers(cwd: Option<String>) -> Result<GrokMcpCatalog, String> {
    let args = ["mcp", "list", "--json"].map(str::to_string).to_vec();
    let output = run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(60)).await?;
    let value = parse_cli_json(&output, "MCP server")?;
    let servers = json_items(&value, &["servers", "mcpServers"])
        .iter()
        .filter_map(mcp_server_summary)
        .collect();

    Ok(GrokMcpCatalog {
        servers,
        message: None,
    })
}

#[tauri::command]
pub async fn add_grok_mcp_server(
    cwd: Option<String>,
    input: AddMcpServerInput,
) -> Result<RuntimeCommandResult, String> {
    let name = validate_runtime_name(&input.name)?;
    let transport = match input.transport.as_str() {
        "stdio" | "http" | "sse" => input.transport,
        _ => return Err("Unsupported MCP transport.".to_string()),
    };
    let scope = match input.scope.as_str() {
        "user" | "project" => input.scope,
        _ => return Err("Unsupported MCP configuration scope.".to_string()),
    };
    if scope == "project" && cwd.as_deref().is_none_or(|value| value.trim().is_empty()) {
        return Err("Choose a workspace before adding a project-scoped MCP server.".to_string());
    }
    let target = validate_cli_value(&input.target, "MCP command or URL", 4_000)?;
    if input.args.len() > 64 {
        return Err("An MCP server may not contain more than 64 arguments.".to_string());
    }
    let server_args = input
        .args
        .into_iter()
        .map(|argument| {
            if argument.len() > 4_000 || argument.chars().any(char::is_control) {
                Err("One or more MCP arguments are invalid.".to_string())
            } else {
                Ok(argument)
            }
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut args = vec![
        "mcp".to_string(),
        "add".to_string(),
        "--scope".to_string(),
        scope,
        "--transport".to_string(),
        transport.clone(),
        name.clone(),
    ];
    if transport == "stdio" {
        args.push("--".to_string());
    }
    args.push(target);
    if transport == "stdio" {
        args.extend(server_args);
    }

    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(2 * 60)).await?;
    Ok(RuntimeCommandResult {
        message: format!("MCP server {name} added."),
    })
}

#[tauri::command]
pub async fn remove_grok_mcp_server(
    cwd: Option<String>,
    name: String,
    scope: String,
) -> Result<RuntimeCommandResult, String> {
    let name = validate_runtime_name(&name)?;
    let scope = match scope.as_str() {
        "user" | "project" => scope,
        _ => return Err("Choose the user or project MCP scope before removing it.".to_string()),
    };
    if scope == "project" && cwd.as_deref().is_none_or(|value| value.trim().is_empty()) {
        return Err("Choose the matching workspace before removing this MCP server.".to_string());
    }
    let args = vec![
        "mcp".to_string(),
        "remove".to_string(),
        "--scope".to_string(),
        scope,
        "--".to_string(),
        name.clone(),
    ];
    run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(60)).await?;
    Ok(RuntimeCommandResult {
        message: format!("MCP server {name} removed."),
    })
}

#[tauri::command]
pub async fn diagnose_grok_mcp_server(
    cwd: Option<String>,
    name: String,
) -> Result<RuntimeCommandResult, String> {
    let name = validate_runtime_name(&name)?;
    let args = vec![
        "mcp".to_string(),
        "doctor".to_string(),
        "--json".to_string(),
        "--".to_string(),
        name.clone(),
    ];
    let output = run_grok_cli(cwd.as_deref(), &args, Duration::from_secs(2 * 60)).await?;
    let value = parse_cli_json(&output, "MCP diagnostic")?;
    let message = value_string(
        &value,
        &[
            "/message",
            "/status",
            "/result/message",
            "/result/status",
            "/0/message",
            "/0/status",
        ],
    )
    .unwrap_or_else(|| format!("MCP server {name} diagnostic completed."));
    Ok(RuntimeCommandResult { message })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_plugin_components_without_exposing_component_details() {
        let plugin = plugin_summary(&serde_json::json!({
            "status": "available",
            "name": "cloudflare",
            "marketplace": "xAI Official",
            "components": {
                "skills": [{ "name": "workers" }, { "name": "wrangler" }],
                "mcpServers": [{ "name": "cloudflare-api" }]
            }
        }))
        .expect("plugin should be projected");

        assert_eq!(plugin.name, "cloudflare");
        assert_eq!(plugin.skill_count, 2);
        assert_eq!(plugin.mcp_server_count, 1);
        assert!(!plugin.enabled);
    }

    #[test]
    fn projects_only_safe_mcp_summary_fields() {
        let server = mcp_server_summary(&serde_json::json!({
            "name": "sentry",
            "url": "https://mcp.sentry.dev/mcp",
            "headers": { "Authorization": "Bearer secret" },
            "scope": "project",
            "enabled": true
        }))
        .expect("server should be projected");
        let serialized = serde_json::to_string(&server).expect("summary should serialize");

        assert_eq!(server.transport, "http");
        assert_eq!(server.scope.as_deref(), Some("project"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("Authorization"));
    }

    #[test]
    fn validates_cli_control_fields() {
        assert_eq!(
            validate_runtime_name("project-tools_2").as_deref(),
            Ok("project-tools_2")
        );
        assert!(validate_runtime_name("-hidden").is_err());
        assert!(validate_runtime_name("project tools").is_err());
        assert!(validate_cli_value("--flag", "source", 100).is_err());
    }
}
