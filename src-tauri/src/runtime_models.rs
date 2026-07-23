use crate::grok_bridge::{apply_windows_system_proxy, grok_executable, hide_console};
use serde::Serialize;
use serde_json::{json, Value};
use std::{process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
    time::timeout,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeLaunchProfile {
    pub(crate) model_id: Option<String>,
    pub(crate) reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeReasoningEffort {
    id: String,
    value: String,
    label: String,
    description: Option<String>,
    default: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeModelSummary {
    model_id: String,
    name: String,
    description: Option<String>,
    total_context_tokens: Option<u64>,
    reasoning_efforts: Vec<RuntimeReasoningEffort>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeModelState {
    pub(crate) current_model_id: String,
    pub(crate) current_reasoning_effort: Option<String>,
    available_models: Vec<RuntimeModelSummary>,
}

fn safe_runtime_metadata_string(value: Option<&Value>, maximum_length: usize) -> Option<String> {
    let value = value?.as_str()?.trim();
    if value.is_empty() || value.len() > maximum_length || value.chars().any(char::is_control) {
        return None;
    }
    Some(value.to_string())
}

pub(crate) fn runtime_model_state_from_initialize(initialize: &Value) -> Option<RuntimeModelState> {
    let model_state = initialize.pointer("/_meta/modelState")?;
    let current_model_id = safe_runtime_metadata_string(model_state.get("currentModelId"), 120)?;
    let available_models = model_state
        .get("availableModels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(64)
        .filter_map(|model| {
            let model_id = safe_runtime_metadata_string(model.get("modelId"), 120)?;
            let name = safe_runtime_metadata_string(model.get("name"), 160)
                .unwrap_or_else(|| model_id.clone());
            let metadata = model.get("_meta");
            let reasoning_efforts = metadata
                .and_then(|value| value.get("reasoningEfforts"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .take(16)
                .filter_map(|effort| {
                    let id = safe_runtime_metadata_string(effort.get("id"), 40)?;
                    let value = safe_runtime_metadata_string(effort.get("value"), 40)?;
                    let label = safe_runtime_metadata_string(effort.get("label"), 120)
                        .unwrap_or_else(|| id.clone());
                    Some(RuntimeReasoningEffort {
                        id,
                        value,
                        label,
                        description: safe_runtime_metadata_string(effort.get("description"), 400),
                        default: effort
                            .get("default")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    })
                })
                .collect();

            Some(RuntimeModelSummary {
                model_id,
                name,
                description: safe_runtime_metadata_string(model.get("description"), 400),
                total_context_tokens: metadata
                    .and_then(|value| value.get("totalContextTokens"))
                    .and_then(Value::as_u64),
                reasoning_efforts,
            })
        })
        .collect::<Vec<_>>();
    let current_reasoning_effort = model_state
        .get("availableModels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|model| {
            model
                .get("modelId")
                .and_then(Value::as_str)
                .is_some_and(|model_id| model_id == current_model_id)
        })
        .and_then(|model| model.pointer("/_meta/reasoningEffort"))
        .and_then(|value| safe_runtime_metadata_string(Some(value), 40));

    Some(RuntimeModelState {
        current_model_id,
        current_reasoning_effort,
        available_models,
    })
}

pub(crate) fn validate_runtime_launch_value(
    value: Option<String>,
    label: &str,
    maximum_length: usize,
    allow_path_separator: bool,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let valid = value.len() <= maximum_length
        && value.chars().enumerate().all(|(index, character)| {
            character.is_ascii_alphanumeric()
                || (index > 0
                    && (matches!(character, '.' | '_' | '-')
                        || (allow_path_separator && matches!(character, ':' | '/'))))
        });
    if !valid {
        return Err(format!(
            "The selected {label} is not a valid Runtime value."
        ));
    }
    Ok(Some(value.to_string()))
}

#[tauri::command]
pub async fn inspect_runtime_models() -> Result<RuntimeModelState, String> {
    let executable = grok_executable()?;
    let mut command = Command::new(executable);
    command
        .args(["agent", "--no-leader", "stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    apply_windows_system_proxy(&mut command);
    hide_console(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to inspect official Runtime models: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "The official Runtime model probe did not expose stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "The official Runtime model probe did not expose stdout.".to_string())?;
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
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
                "clientType": "grok-desktop-model-probe",
                "clientVersion": env!("CARGO_PKG_VERSION"),
                "startupHints": {
                    "nonInteractive": true,
                    "skipGitStatus": true,
                    "skipProjectLayout": true
                }
            }
        }
    });
    let serialized = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    stdin
        .write_all(format!("{serialized}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to request official Runtime models: {error}"))?;
    stdin
        .flush()
        .await
        .map_err(|error| format!("Failed to flush the Runtime model request: {error}"))?;

    let mut lines = BufReader::new(stdout).lines();
    let initialize = timeout(Duration::from_secs(30), async {
        loop {
            let line = lines
                .next_line()
                .await
                .map_err(|error| format!("Failed to read official Runtime models: {error}"))?
                .ok_or_else(|| {
                    "The official Runtime model probe exited before responding.".to_string()
                })?;
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if message.get("id").and_then(Value::as_u64) != Some(1) {
                continue;
            }
            if let Some(error) = message.get("error") {
                return Err(format!("The official Runtime model probe failed: {error}"));
            }
            return Ok(message.get("result").cloned().unwrap_or(Value::Null));
        }
    })
    .await
    .map_err(|_| "The official Runtime model probe timed out.".to_string())?;

    drop(stdin);
    let _ = child.kill().await;
    let _ = child.wait().await;

    let initialize = initialize?;
    runtime_model_state_from_initialize(&initialize)
        .ok_or_else(|| "The official Runtime did not report a model catalog.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_only_safe_runtime_model_metadata() {
        let state = runtime_model_state_from_initialize(&json!({
            "_meta": {
                "modelState": {
                    "currentModelId": "grok-4.5",
                    "availableModels": [{
                        "modelId": "grok-4.5",
                        "name": "Grok 4.5",
                        "description": "Frontier model",
                        "_meta": {
                            "totalContextTokens": 500000,
                            "reasoningEffort": "high",
                            "reasoningEfforts": [{
                                "id": "high",
                                "value": "high",
                                "label": "High Effort",
                                "description": "Highest quality",
                                "default": true,
                                "credential": "must not be projected"
                            }]
                        },
                        "endpoint": "must not be projected"
                    }]
                }
            }
        }))
        .expect("model state should be available");

        assert_eq!(state.current_model_id, "grok-4.5");
        assert_eq!(state.current_reasoning_effort.as_deref(), Some("high"));
        assert_eq!(state.available_models.len(), 1);
        assert_eq!(
            state.available_models[0].total_context_tokens,
            Some(500_000)
        );
        assert_eq!(state.available_models[0].reasoning_efforts.len(), 1);

        let serialized = serde_json::to_string(&state).expect("model state should serialize");
        assert!(!serialized.contains("credential"));
        assert!(!serialized.contains("endpoint"));
    }

    #[test]
    fn validates_runtime_launch_values_before_building_cli_arguments() {
        assert_eq!(
            validate_runtime_launch_value(Some("grok-4.5".to_string()), "model", 120, true)
                .expect("official model id should be accepted")
                .as_deref(),
            Some("grok-4.5")
        );
        assert_eq!(
            validate_runtime_launch_value(Some("high".to_string()), "reasoning effort", 40, false)
                .expect("official effort should be accepted")
                .as_deref(),
            Some("high")
        );
        assert!(validate_runtime_launch_value(
            Some("--always-approve".to_string()),
            "model",
            120,
            true
        )
        .is_err());
        assert!(validate_runtime_launch_value(
            Some("high effort".to_string()),
            "reasoning effort",
            40,
            false
        )
        .is_err());
    }
}
