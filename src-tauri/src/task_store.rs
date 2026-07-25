use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

const TASK_STORE_FILE: &str = "task-store-v1.json";
const TASK_STORE_BACKUP_FILE: &str = "task-store-v1.backup.json";
const MAX_TASK_STORE_BYTES: u64 = 64 * 1024 * 1024;
const TASK_BACKUP_SCHEMA: &str = "grokdesk-task-store-backup";
const TASK_BACKUP_VERSION: u64 = 1;
const MAX_TASKS: usize = 200;

#[derive(Default)]
pub struct TaskStorePersistence {
    io: Mutex<()>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTaskStoreLoad {
    content: Option<String>,
    source: &'static str,
    recovered_from_backup: bool,
    modified_at_ms: Option<u64>,
    byte_length: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTaskStoreSave {
    modified_at_ms: u64,
    byte_length: u64,
}

struct StoredSnapshot {
    content: String,
    modified_at_ms: Option<u64>,
}

fn modified_at_ms(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

fn validate_snapshot_value(value: &Value) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Task history must be a JSON object.".to_string())?;
    let version = object
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Task history is missing its schema version.".to_string())?;
    if version != 1 && version != 2 {
        return Err("Task history uses an unsupported schema version.".into());
    }
    if !object.get("tasks").is_some_and(Value::is_array) {
        return Err("Task history is missing its task list.".into());
    }
    if !object.get("activeTaskIds").is_some_and(Value::is_object) {
        return Err("Task history is missing its active task index.".into());
    }

    let tasks = object
        .get("tasks")
        .and_then(Value::as_array)
        .ok_or_else(|| "Task history is missing its task list.".to_string())?;
    if tasks.len() > MAX_TASKS {
        return Err(format!(
            "Task history contains more than the {MAX_TASKS} supported tasks."
        ));
    }
    let mut task_ids = HashSet::with_capacity(tasks.len());
    for task in tasks {
        let task = task
            .as_object()
            .ok_or_else(|| "Task history contains a malformed task.".to_string())?;
        for field in ["id", "workspacePath", "createdAt", "updatedAt"] {
            if !task
                .get(field)
                .and_then(Value::as_str)
                .is_some_and(|value| !value.trim().is_empty())
            {
                return Err("Task history contains a malformed task.".into());
            }
        }
        let id = task
            .get("id")
            .and_then(Value::as_str)
            .expect("validated task id");
        if !task_ids.insert(id) {
            return Err("Task history contains a duplicate task.".into());
        }
    }
    let active_task_ids = object
        .get("activeTaskIds")
        .and_then(Value::as_object)
        .ok_or_else(|| "Task history is missing its active task index.".to_string())?;
    if active_task_ids.values().any(|task_id| !task_id.is_string()) {
        return Err("Task history contains a malformed active task index.".into());
    }
    Ok(())
}

fn validate_snapshot_content(content: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_TASK_STORE_BYTES {
        return Err("Task history exceeds the 64 MiB safety limit.".into());
    }
    let value = serde_json::from_str::<Value>(content)
        .map_err(|_| "Task history is not valid UTF-8 JSON.".to_string())?;
    validate_snapshot_value(&value)
}

fn validate_backup_content(content: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_TASK_STORE_BYTES {
        return Err("This GrokDesk backup exceeds the 64 MiB safety limit.".into());
    }
    let value = serde_json::from_str::<Value>(content)
        .map_err(|_| "The selected GrokDesk backup is not valid UTF-8 JSON.".to_string())?;
    let object = value
        .as_object()
        .ok_or_else(|| "The selected file is not a GrokDesk task backup.".to_string())?;
    if object.get("schema").and_then(Value::as_str) != Some(TASK_BACKUP_SCHEMA)
        || object.get("version").and_then(Value::as_u64) != Some(TASK_BACKUP_VERSION)
    {
        return Err("The selected file is not a supported GrokDesk task backup.".into());
    }
    validate_snapshot_value(
        object
            .get("store")
            .ok_or_else(|| "The selected GrokDesk backup has no task store.".to_string())?,
    )
}

fn read_valid_snapshot(path: &Path) -> Result<Option<StoredSnapshot>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Task history could not be read from app storage.".into()),
    };
    if bytes.len() as u64 > MAX_TASK_STORE_BYTES {
        return Err("Task history exceeds the 64 MiB safety limit.".into());
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| "Task history is not valid UTF-8 JSON.".to_string())?;
    validate_snapshot_content(&content)?;
    Ok(Some(StoredSnapshot {
        content,
        modified_at_ms: modified_at_ms(path),
    }))
}

fn temporary_path(target: &Path) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "The task storage location is invalid.".to_string())?;
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The task storage file name is invalid.".to_string())?;
    Ok(parent.join(format!(".{name}.{}.tmp", std::process::id())))
}

fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temp, target)
        .map_err(|_| "The new task storage file could not be activated.".to_string())
}

fn write_atomic(target: &Path, content: &str) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "The task storage location is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "The GrokDesk app-data folder could not be created.".to_string())?;
    let temp = temporary_path(target)?;
    let result = (|| {
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temp)
            .map_err(|_| "A temporary task storage file could not be created.".to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|_| "Task history could not be written completely.".to_string())?;
        file.sync_all()
            .map_err(|_| "Task history could not be flushed safely to disk.".to_string())?;
        drop(file);
        replace_file(&temp, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn load_from_directory(directory: &Path) -> Result<NativeTaskStoreLoad, String> {
    let primary = directory.join(TASK_STORE_FILE);
    let backup = directory.join(TASK_STORE_BACKUP_FILE);
    match read_valid_snapshot(&primary) {
        Ok(Some(snapshot)) => Ok(NativeTaskStoreLoad {
            byte_length: snapshot.content.len() as u64,
            content: Some(snapshot.content),
            source: "primary",
            recovered_from_backup: false,
            modified_at_ms: snapshot.modified_at_ms,
        }),
        Ok(None) => match read_valid_snapshot(&backup)? {
            Some(snapshot) => Ok(NativeTaskStoreLoad {
                byte_length: snapshot.content.len() as u64,
                content: Some(snapshot.content),
                source: "backup",
                recovered_from_backup: true,
                modified_at_ms: snapshot.modified_at_ms,
            }),
            None => Ok(NativeTaskStoreLoad {
                content: None,
                source: "empty",
                recovered_from_backup: false,
                modified_at_ms: None,
                byte_length: 0,
            }),
        },
        Err(primary_error) => match read_valid_snapshot(&backup) {
            Ok(Some(snapshot)) => Ok(NativeTaskStoreLoad {
                byte_length: snapshot.content.len() as u64,
                content: Some(snapshot.content),
                source: "backup",
                recovered_from_backup: true,
                modified_at_ms: snapshot.modified_at_ms,
            }),
            Ok(None) => Err(format!(
                "{primary_error} No valid automatic backup is available."
            )),
            Err(_) => Err(format!(
                "{primary_error} The automatic backup could not be recovered."
            )),
        },
    }
}

fn save_to_directory(directory: &Path, content: &str) -> Result<NativeTaskStoreSave, String> {
    validate_snapshot_content(content)?;
    fs::create_dir_all(directory)
        .map_err(|_| "The GrokDesk app-data folder could not be created.".to_string())?;
    let primary = directory.join(TASK_STORE_FILE);
    let backup = directory.join(TASK_STORE_BACKUP_FILE);

    if let Ok(Some(previous)) = read_valid_snapshot(&primary) {
        write_atomic(&backup, &previous.content)?;
    }
    write_atomic(&primary, content)?;
    if !backup.exists() {
        write_atomic(&backup, content)?;
    }

    Ok(NativeTaskStoreSave {
        modified_at_ms: modified_at_ms(&primary).unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .ok()
                .and_then(|duration| u64::try_from(duration.as_millis()).ok())
                .unwrap_or(0)
        }),
        byte_length: content.len() as u64,
    })
}

fn app_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "The GrokDesk app-data location is unavailable.".to_string())
}

#[tauri::command]
pub async fn load_native_task_store(
    app: AppHandle,
    persistence: State<'_, TaskStorePersistence>,
) -> Result<NativeTaskStoreLoad, String> {
    let _guard = persistence.io.lock().await;
    let directory = app_data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || load_from_directory(&directory))
        .await
        .map_err(|_| "The native task storage worker stopped unexpectedly.".to_string())?
}

#[tauri::command]
pub async fn save_native_task_store(
    app: AppHandle,
    persistence: State<'_, TaskStorePersistence>,
    content: String,
) -> Result<NativeTaskStoreSave, String> {
    let _guard = persistence.io.lock().await;
    let directory = app_data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || save_to_directory(&directory, &content))
        .await
        .map_err(|_| "The native task storage worker stopped unexpectedly.".to_string())?
}

fn validate_json_path(path: &Path) -> Result<(), String> {
    let is_json = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("GrokDesk task backups must use the .json extension.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn read_task_store_backup_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    validate_json_path(path)?;
    let metadata =
        fs::metadata(path).map_err(|_| "Unable to inspect the selected GrokDesk backup.")?;
    if !metadata.is_file() {
        return Err("The selected GrokDesk backup is not a file.".into());
    }
    if metadata.len() > MAX_TASK_STORE_BYTES {
        return Err("The selected GrokDesk backup exceeds the 64 MiB safety limit.".into());
    }
    let content = fs::read_to_string(path)
        .map_err(|_| "Unable to read the selected GrokDesk backup as UTF-8 JSON.".to_string())?;
    validate_backup_content(&content)?;
    Ok(content)
}

#[tauri::command]
pub fn write_task_store_backup_file(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    validate_json_path(path)?;
    validate_backup_content(&content)?;
    let parent = path
        .parent()
        .ok_or_else(|| "The selected backup location is invalid.".to_string())?;
    if !parent.is_dir() {
        return Err("The selected backup folder does not exist.".into());
    }
    write_atomic(path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "grokdesk-task-store-{name}-{}-{suffix}",
            std::process::id()
        ))
    }

    fn snapshot(title: &str) -> String {
        serde_json::json!({
            "version": 2,
            "tasks": [{
                "id": "task-1",
                "workspacePath": "C:\\work\\app",
                "title": title,
                "createdAt": "2026-07-25T00:00:00.000Z",
                "updatedAt": "2026-07-25T00:00:00.000Z"
            }],
            "activeTaskIds": { "c:\\work\\app": "task-1" }
        })
        .to_string()
    }

    #[test]
    fn native_task_store_survives_restart_and_corruption_recovery_smoke() {
        let directory = test_directory("restart-recovery-smoke");
        let first = snapshot("First launch");
        let second = snapshot("After restart");
        let final_snapshot = snapshot("Recovered and saved");

        save_to_directory(&directory, &first).expect("first save");
        let first_restart = load_from_directory(&directory).expect("first restart load");
        assert_eq!(first_restart.content.as_deref(), Some(first.as_str()));
        assert_eq!(first_restart.source, "primary");
        assert!(!first_restart.recovered_from_backup);

        save_to_directory(&directory, &second).expect("second save");
        let second_restart = load_from_directory(&directory).expect("second restart load");
        assert_eq!(second_restart.content.as_deref(), Some(second.as_str()));
        let previous = read_valid_snapshot(&directory.join(TASK_STORE_BACKUP_FILE))
            .expect("read previous version")
            .expect("previous version");
        assert_eq!(previous.content, first);

        fs::write(directory.join(TASK_STORE_FILE), "broken primary").expect("corrupt primary");
        let recovered = load_from_directory(&directory).expect("recover after restart");
        assert_eq!(recovered.content.as_deref(), Some(first.as_str()));
        assert_eq!(recovered.source, "backup");
        assert!(recovered.recovered_from_backup);

        save_to_directory(
            &directory,
            recovered.content.as_deref().expect("recovered content"),
        )
        .expect("repair primary");
        let repaired_restart = load_from_directory(&directory).expect("repaired restart load");
        assert_eq!(repaired_restart.content.as_deref(), Some(first.as_str()));
        assert_eq!(repaired_restart.source, "primary");
        assert!(!repaired_restart.recovered_from_backup);

        save_to_directory(&directory, &final_snapshot).expect("post-recovery save");
        let final_restart = load_from_directory(&directory).expect("final restart load");
        assert_eq!(
            final_restart.content.as_deref(),
            Some(final_snapshot.as_str())
        );
        assert_eq!(final_restart.source, "primary");

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_malformed_or_unsupported_task_history() {
        assert!(validate_snapshot_content("not json").is_err());
        assert!(validate_snapshot_content(
            &serde_json::json!({ "version": 99, "tasks": [], "activeTaskIds": {} }).to_string()
        )
        .is_err());

        let duplicate = serde_json::json!({
            "version": 2,
            "tasks": [
                {
                    "id": "same",
                    "workspacePath": "C:\\work\\app",
                    "createdAt": "2026-07-25T00:00:00.000Z",
                    "updatedAt": "2026-07-25T00:00:00.000Z"
                },
                {
                    "id": "same",
                    "workspacePath": "C:\\work\\app",
                    "createdAt": "2026-07-25T00:00:00.000Z",
                    "updatedAt": "2026-07-25T00:00:00.000Z"
                }
            ],
            "activeTaskIds": {}
        });
        assert!(validate_snapshot_content(&duplicate.to_string()).is_err());

        let tasks = (0..=MAX_TASKS)
            .map(|index| {
                serde_json::json!({
                    "id": format!("task-{index}"),
                    "workspacePath": "C:\\work\\app",
                    "createdAt": "2026-07-25T00:00:00.000Z",
                    "updatedAt": "2026-07-25T00:00:00.000Z"
                })
            })
            .collect::<Vec<_>>();
        assert!(validate_snapshot_content(
            &serde_json::json!({
                "version": 2,
                "tasks": tasks,
                "activeTaskIds": {}
            })
            .to_string()
        )
        .is_err());
    }

    #[test]
    fn keeps_the_previous_snapshot_as_an_automatic_backup() {
        let directory = test_directory("backup");
        let first = snapshot("First");
        let second = snapshot("Second");

        save_to_directory(&directory, &first).expect("first save");
        save_to_directory(&directory, &second).expect("second save");

        let primary = read_valid_snapshot(&directory.join(TASK_STORE_FILE))
            .expect("read primary")
            .expect("primary");
        let backup = read_valid_snapshot(&directory.join(TASK_STORE_BACKUP_FILE))
            .expect("read backup")
            .expect("backup");
        assert_eq!(primary.content, second);
        assert_eq!(backup.content, first);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn recovers_from_the_backup_when_the_primary_is_corrupt() {
        let directory = test_directory("recovery");
        let first = snapshot("Recover me");
        save_to_directory(&directory, &first).expect("initial save");
        fs::write(directory.join(TASK_STORE_FILE), "broken").expect("corrupt primary");

        let loaded = load_from_directory(&directory).expect("recover backup");
        assert_eq!(loaded.content.as_deref(), Some(first.as_str()));
        assert_eq!(loaded.source, "backup");
        assert!(loaded.recovered_from_backup);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_restart_when_primary_and_backup_are_both_corrupt() {
        let directory = test_directory("double-corruption");
        fs::create_dir_all(&directory).expect("create test directory");
        fs::write(directory.join(TASK_STORE_FILE), "broken primary")
            .expect("write corrupt primary");
        fs::write(directory.join(TASK_STORE_BACKUP_FILE), "broken backup")
            .expect("write corrupt backup");

        let error = load_from_directory(&directory).expect_err("reject corrupt store");
        assert!(error.contains("automatic backup could not be recovered"));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn validates_full_store_backup_envelopes() {
        let backup = serde_json::json!({
            "schema": TASK_BACKUP_SCHEMA,
            "version": TASK_BACKUP_VERSION,
            "exportedAt": "2026-07-25T00:00:00.000Z",
            "store": serde_json::from_str::<Value>(&snapshot("Backup")).expect("snapshot")
        })
        .to_string();
        assert!(validate_backup_content(&backup).is_ok());
        assert!(validate_backup_content(&snapshot("Not an envelope")).is_err());
    }
}
