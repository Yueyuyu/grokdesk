use std::{fs, path::Path};

const MAX_TASK_EXCHANGE_BYTES: u64 = 8 * 1024 * 1024;

fn validate_json_path(path: &Path) -> Result<(), String> {
    let is_json = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("Task exchange files must use the .json extension.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn read_task_exchange_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    validate_json_path(path)?;
    let metadata = fs::metadata(path).map_err(|_| "Unable to inspect the selected task file.")?;
    if !metadata.is_file() {
        return Err("The selected task export is not a file.".into());
    }
    if metadata.len() > MAX_TASK_EXCHANGE_BYTES {
        return Err("The selected task file exceeds the 8 MiB safety limit.".into());
    }
    let content = fs::read_to_string(path)
        .map_err(|_| "Unable to read the selected task file as UTF-8 JSON.".to_string())?;
    if content.len() as u64 > MAX_TASK_EXCHANGE_BYTES {
        return Err("The selected task file exceeds the 8 MiB safety limit.".into());
    }
    Ok(content)
}

#[tauri::command]
pub fn write_task_exchange_file(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    validate_json_path(path)?;
    if content.len() as u64 > MAX_TASK_EXCHANGE_BYTES {
        return Err("This task export exceeds the 8 MiB safety limit.".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "The selected export location is invalid.".to_string())?;
    if !parent.is_dir() {
        return Err("The selected export folder does not exist.".into());
    }
    fs::write(path, content).map_err(|_| "Unable to write the task export to that location.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_json_paths_case_insensitively() {
        assert!(validate_json_path(Path::new("task.grokdesk-task.json")).is_ok());
        assert!(validate_json_path(Path::new("TASK.JSON")).is_ok());
    }

    #[test]
    fn rejects_non_json_paths() {
        assert!(validate_json_path(Path::new("task.txt")).is_err());
        assert!(validate_json_path(Path::new("task")).is_err());
    }
}
