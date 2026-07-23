use crate::runtime_extensions::{parse_cli_json, run_grok_cli};
use serde::Serialize;
use serde_json::Value;
use std::{path::Path, time::Duration};

const MAX_CONTEXT_ITEMS: usize = 500;
const MAX_NAME_LENGTH: usize = 240;
const MAX_DESCRIPTION_LENGTH: usize = 2_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProjectInstruction {
    path: String,
    scope: String,
    file_type: String,
    size_bytes: u64,
    approx_tokens: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSkillSummary {
    name: String,
    description: Option<String>,
    source_type: String,
    user_invocable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeContextCounts {
    agents: usize,
    hooks: usize,
    plugins: usize,
    mcp_servers: usize,
    lsp_servers: usize,
    config_layers: usize,
    permission_sources: usize,
    permission_rules_loaded: u64,
    permission_rules_skipped: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeContextSnapshot {
    grok_version: String,
    channel: String,
    project_trusted: Option<bool>,
    project_instructions: Vec<RuntimeProjectInstruction>,
    skills: Vec<RuntimeSkillSummary>,
    counts: RuntimeContextCounts,
}

fn clean_text(value: &str, maximum_length: usize) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(maximum_length)
        .collect::<String>()
        .trim()
        .to_string()
}

fn contains_credential_value(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    let labeled_secret = [
        "authorization:",
        "authorization=",
        "proxy-authorization:",
        "proxy-authorization=",
        "api_key:",
        "api_key=",
        "api-key:",
        "api-key=",
        "apikey:",
        "apikey=",
        "access_token:",
        "access_token=",
        "access-token:",
        "access-token=",
        "refresh_token:",
        "refresh_token=",
        "refresh-token:",
        "refresh-token=",
        "password:",
        "password=",
        "secret:",
        "secret=",
        "token:",
        "token=",
        "cookie:",
        "cookie=",
        "bearer ",
    ]
    .iter()
    .any(|marker| normalized.contains(marker));

    labeled_secret
        || normalized
            .split(|character: char| {
                character.is_whitespace()
                    || matches!(character, '"' | '\'' | ',' | ';' | '(' | ')' | '[' | ']')
            })
            .any(|token| {
                token.len() >= 12
                    && (token.starts_with("ghp_")
                        || token.starts_with("github_pat_")
                        || token.starts_with("sk-"))
            })
}

fn value_string(value: &Value, pointer: &str, maximum_length: usize) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(|text| clean_text(text, maximum_length))
        .filter(|text| !text.is_empty())
        .filter(|text| !contains_credential_value(text))
}

fn collection_count(value: &Value, pointer: &str) -> usize {
    value
        .pointer(pointer)
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or_default()
}

fn safe_project_path(raw_path: &str, project_root: Option<&str>, workspace: &Path) -> String {
    let normalized_path = raw_path.replace('\\', "/");
    let looks_absolute = normalized_path.starts_with('/')
        || normalized_path.starts_with("//")
        || normalized_path
            .as_bytes()
            .get(1)
            .is_some_and(|separator| *separator == b':');
    if !looks_absolute {
        return clean_text(raw_path, MAX_NAME_LENGTH);
    }

    let workspace_text = workspace.to_string_lossy();
    let relative = project_root
        .into_iter()
        .chain(std::iter::once(workspace_text.as_ref()))
        .find_map(|root| {
            let normalized_root = root.replace('\\', "/").trim_end_matches('/').to_string();
            let path_lower = normalized_path.to_ascii_lowercase();
            let root_lower = normalized_root.to_ascii_lowercase();
            let prefix = format!("{root_lower}/");
            path_lower.strip_prefix(&prefix).map(|relative| {
                normalized_path[normalized_path.len() - relative.len()..].to_string()
            })
        });

    relative
        .filter(|path| !path.is_empty())
        .or_else(|| normalized_path.rsplit('/').next().map(str::to_string))
        .map(|path| clean_text(&path, MAX_NAME_LENGTH))
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| "Project instruction".to_string())
}

fn runtime_context_from_value(value: &Value, workspace: &Path) -> RuntimeContextSnapshot {
    let project_root = value.pointer("/projectRoot").and_then(Value::as_str);
    let mut project_instructions = value
        .pointer("/projectInstructions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(MAX_CONTEXT_ITEMS)
        .filter_map(|instruction| {
            let raw_path = instruction.get("path")?.as_str()?;
            Some(RuntimeProjectInstruction {
                path: safe_project_path(raw_path, project_root, workspace),
                scope: value_string(instruction, "/scope", 80)
                    .unwrap_or_else(|| "project".to_string()),
                file_type: value_string(instruction, "/fileType", 80)
                    .unwrap_or_else(|| "instructions".to_string()),
                size_bytes: instruction
                    .get("sizeBytes")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
                approx_tokens: instruction
                    .get("approxTokens")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    project_instructions.sort_by(|left, right| left.path.cmp(&right.path));

    let mut skills = value
        .pointer("/skills")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(MAX_CONTEXT_ITEMS)
        .filter_map(|skill| {
            let name = value_string(skill, "/name", MAX_NAME_LENGTH)?;
            Some(RuntimeSkillSummary {
                name,
                description: value_string(skill, "/description", MAX_DESCRIPTION_LENGTH),
                source_type: value_string(skill, "/source/type", 80)
                    .unwrap_or_else(|| "runtime".to_string()),
                user_invocable: skill
                    .get("userInvocable")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| left.name.cmp(&right.name));

    RuntimeContextSnapshot {
        grok_version: value_string(value, "/grokVersion", 120)
            .unwrap_or_else(|| "Unknown".to_string()),
        channel: value_string(value, "/channel", 80).unwrap_or_else(|| "default".to_string()),
        project_trusted: value.pointer("/projectTrusted").and_then(Value::as_bool),
        project_instructions,
        skills,
        counts: RuntimeContextCounts {
            agents: collection_count(value, "/agents"),
            hooks: collection_count(value, "/hooks"),
            plugins: collection_count(value, "/plugins"),
            mcp_servers: collection_count(value, "/mcpServers"),
            lsp_servers: collection_count(value, "/lspServers"),
            config_layers: collection_count(value, "/configSources/layers"),
            permission_sources: collection_count(value, "/permissions/sources"),
            permission_rules_loaded: value
                .pointer("/permissions/loaded")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
            permission_rules_skipped: collection_count(value, "/permissions/skipped"),
        },
    }
}

#[tauri::command]
pub async fn inspect_grok_context(cwd: String) -> Result<RuntimeContextSnapshot, String> {
    if cwd.trim().is_empty() {
        return Err("Choose a workspace before inspecting Runtime context.".to_string());
    }

    let args = ["inspect", "--json"].map(str::to_string).to_vec();
    let output = run_grok_cli(Some(&cwd), &args, Duration::from_secs(30)).await?;
    let value = parse_cli_json(&output, "Runtime context")?;
    Ok(runtime_context_from_value(&value, Path::new(&cwd)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_runtime_context_without_credentials_or_absolute_paths() {
        let value = serde_json::json!({
            "grokVersion": "0.2.106",
            "channel": "stable",
            "projectRoot": "/Users/Alice/private-project",
            "projectTrusted": true,
            "projectInstructions": [{
                "path": "/Users/Alice/private-project/AGENTS.md",
                "scope": "project",
                "fileType": "agents_md",
                "sizeBytes": 1234,
                "approxTokens": 210
            }],
            "permissions": {
                "sources": [{ "Authorization": "Bearer secret" }],
                "loaded": 3,
                "skipped": ["unsafe"]
            },
            "skills": [{
                "name": "review",
                "description": "Authorization: Bearer super-secret-value",
                "source": {
                    "type": "bundled",
                    "path": "/Users/Alice/.grok/skills/review/SKILL.md",
                    "token": "secret"
                },
                "userInvocable": true
            }],
            "agents": [{ "name": "default" }],
            "hooks": [],
            "plugins": [],
            "mcpServers": [{
                "name": "private-server",
                "headers": { "Authorization": "Bearer secret" }
            }],
            "lspServers": [],
            "configSources": {
                "layers": [{
                    "role": "user",
                    "path": "/Users/Alice/.grok/config.toml",
                    "apiKey": "secret"
                }]
            }
        });

        let snapshot =
            runtime_context_from_value(&value, Path::new("/Users/Alice/private-project"));
        let serialized = serde_json::to_string(&snapshot).expect("context should serialize");

        assert_eq!(snapshot.project_instructions[0].path, "AGENTS.md");
        assert_eq!(snapshot.skills[0].name, "review");
        assert_eq!(snapshot.skills[0].description, None);
        assert_eq!(snapshot.project_trusted, Some(true));
        assert_eq!(snapshot.counts.mcp_servers, 1);
        assert_eq!(snapshot.counts.permission_rules_loaded, 3);
        assert!(!serialized.contains("Alice"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("Authorization"));
        assert!(!serialized.contains("private-server"));
    }

    #[test]
    fn reduces_external_instruction_paths_to_a_file_name() {
        assert_eq!(
            safe_project_path(
                "/managed/company/AGENTS.md",
                Some("/workspace/project"),
                Path::new("/workspace/project"),
            ),
            "AGENTS.md"
        );
    }

    #[test]
    fn distinguishes_missing_workspace_trust_from_an_untrusted_workspace() {
        let missing = runtime_context_from_value(&serde_json::json!({}), Path::new("."));
        let untrusted = runtime_context_from_value(
            &serde_json::json!({ "projectTrusted": false }),
            Path::new("."),
        );

        assert_eq!(missing.project_trusted, None);
        assert_eq!(untrusted.project_trusted, Some(false));
    }
}
