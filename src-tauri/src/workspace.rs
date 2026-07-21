use serde::Serialize;
use std::{
    ffi::OsStr,
    fs::{self, File},
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Command, Output, Stdio},
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const MAX_DIFF_BYTES: usize = 600_000;
const MAX_UNTRACKED_LINES: usize = 4_000;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChange {
    path: String,
    original_path: Option<String>,
    status_code: String,
    staged: bool,
    unstaged: bool,
    index_status: Option<String>,
    worktree_status: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    mode: String,
    repository_root: Option<String>,
    branch: Option<String>,
    changes: Vec<WorkspaceChange>,
    message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDiff {
    path: String,
    status_code: String,
    staged: bool,
    unstaged: bool,
    patch: String,
    binary: bool,
    truncated: bool,
}

struct RepositoryState {
    root: PathBuf,
    branch: Option<String>,
    changes: Vec<WorkspaceChange>,
}

fn empty_snapshot(mode: &str, message: impl Into<String>) -> WorkspaceSnapshot {
    WorkspaceSnapshot {
        mode: mode.to_string(),
        repository_root: None,
        branch: None,
        changes: Vec::new(),
        message: Some(message.into()),
    }
}

fn canonical_workspace(cwd: &str) -> Result<PathBuf, String> {
    Path::new(cwd)
        .canonicalize()
        .map_err(|error| format!("Workspace `{cwd}` is not accessible: {error}"))
}

fn git_executable() -> Result<PathBuf, String> {
    which::which("git").map_err(|_| {
        "Git is not installed or is not available on PATH. Install Git to review workspace changes."
            .to_string()
    })
}

fn run_git<I, S>(cwd: &Path, args: I) -> Result<Output, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(git_executable()?);
    command
        .arg("-c")
        .arg("core.quotepath=false")
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
        .output()
        .map_err(|error| format!("Could not run Git in `{}`: {error}", cwd.display()))
}

fn command_error(action: &str, output: &Output) -> String {
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if detail.is_empty() {
        format!("Git could not {action}.")
    } else {
        format!("Git could not {action}: {detail}")
    }
}

fn run_git_checked<I, S>(cwd: &Path, args: I, action: &str) -> Result<Output, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(cwd, args)?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(command_error(action, &output))
    }
}

fn status_character(value: u8) -> Option<String> {
    (!matches!(value, b' ' | b'?' | b'!')).then(|| char::from(value).to_string())
}

fn is_conflict(index: u8, worktree: u8) -> bool {
    index == b'U'
        || worktree == b'U'
        || matches!(
            (index, worktree),
            (b'A', b'A') | (b'D', b'D') | (b'A', b'U') | (b'U', b'A') | (b'D', b'U') | (b'U', b'D')
        )
}

fn display_status(index: u8, worktree: u8) -> &'static str {
    if is_conflict(index, worktree) {
        return "!";
    }
    if index == b'?' && worktree == b'?' {
        return "?";
    }
    if index == b'R' || worktree == b'R' {
        return "R";
    }
    if index == b'C' || worktree == b'C' {
        return "C";
    }
    if index == b'A' || worktree == b'A' {
        return "A";
    }
    if index == b'D' || worktree == b'D' {
        return "D";
    }
    if index == b'T' || worktree == b'T' {
        return "T";
    }
    "M"
}

fn parse_porcelain_status(output: &[u8]) -> Vec<WorkspaceChange> {
    let fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    let mut changes = Vec::new();
    let mut index = 0;

    while index < fields.len() {
        let field = fields[index];
        if field.len() < 4 {
            index += 1;
            continue;
        }

        let index_status = field[0];
        let worktree_status = field[1];
        let path = String::from_utf8_lossy(&field[3..]).into_owned();
        let renamed_or_copied =
            matches!(index_status, b'R' | b'C') || matches!(worktree_status, b'R' | b'C');
        let original_path = if renamed_or_copied && index + 1 < fields.len() {
            index += 1;
            Some(String::from_utf8_lossy(fields[index]).into_owned())
        } else {
            None
        };
        let untracked = index_status == b'?' && worktree_status == b'?';

        changes.push(WorkspaceChange {
            path,
            original_path,
            status_code: display_status(index_status, worktree_status).to_string(),
            staged: !untracked && !matches!(index_status, b' ' | b'!' | b'?'),
            unstaged: untracked || !matches!(worktree_status, b' ' | b'!'),
            index_status: status_character(index_status),
            worktree_status: status_character(worktree_status),
        });
        index += 1;
    }

    changes.sort_by(|left, right| left.path.to_lowercase().cmp(&right.path.to_lowercase()));
    changes
}

fn load_repository(cwd: &str) -> Result<Option<RepositoryState>, String> {
    let workspace = canonical_workspace(cwd)?;
    let root_output = run_git(&workspace, ["rev-parse", "--show-toplevel"])?;
    if !root_output.status.success() {
        return Ok(None);
    }

    let root_text = String::from_utf8_lossy(&root_output.stdout)
        .trim()
        .to_string();
    let root = canonical_workspace(&root_text)?;
    let branch_output = run_git(&root, ["branch", "--show-current"])?;
    let branch = branch_output.status.success().then(|| {
        String::from_utf8_lossy(&branch_output.stdout)
            .trim()
            .to_string()
    });
    let branch = branch.filter(|value| !value.is_empty()).or_else(|| {
        let output = run_git(&root, ["rev-parse", "--short", "HEAD"]).ok()?;
        output.status.success().then(|| {
            format!(
                "detached@{}",
                String::from_utf8_lossy(&output.stdout).trim()
            )
        })
    });
    let status = run_git_checked(
        &root,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        "read workspace status",
    )?;

    Ok(Some(RepositoryState {
        root,
        branch,
        changes: parse_porcelain_status(&status.stdout),
    }))
}

fn snapshot_from_repository(repository: RepositoryState) -> WorkspaceSnapshot {
    WorkspaceSnapshot {
        mode: "git".to_string(),
        repository_root: Some(repository.root.to_string_lossy().into_owned()),
        branch: repository.branch,
        changes: repository.changes,
        message: None,
    }
}

fn inspect_workspace_internal(cwd: &str) -> Result<WorkspaceSnapshot, String> {
    if cwd.trim().is_empty() || cwd.trim() == "." {
        return Ok(empty_snapshot(
            "unselected",
            "Choose a project folder to inspect real workspace changes.",
        ));
    }

    match load_repository(cwd)? {
        Some(repository) => Ok(snapshot_from_repository(repository)),
        None => Ok(empty_snapshot(
            "not_git",
            "This folder is not inside a Git repository. Chat still works, but change review requires Git.",
        )),
    }
}

fn repository_change(cwd: &str, path: &str) -> Result<(RepositoryState, WorkspaceChange), String> {
    let repository = load_repository(cwd)?
        .ok_or_else(|| "The selected workspace is not inside a Git repository.".to_string())?;
    let change = repository
        .changes
        .iter()
        .find(|change| change.path == path)
        .cloned()
        .ok_or_else(|| {
            format!("`{path}` is no longer changed. Refresh the workspace and try again.")
        })?;
    Ok((repository, change))
}

fn validate_relative_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if relative.trim().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("Unsafe workspace path `{relative}`."));
    }

    let joined = root.join(path);
    if joined.exists() {
        let canonical = joined
            .canonicalize()
            .map_err(|error| format!("Could not inspect `{relative}`: {error}"))?;
        if !canonical.starts_with(root) {
            return Err(format!(
                "Workspace path `{relative}` resolves outside the repository."
            ));
        }
    }
    Ok(joined)
}

fn change_paths<'a>(change: &'a WorkspaceChange) -> Vec<&'a str> {
    let mut paths = vec![change.path.as_str()];
    if let Some(original) = change.original_path.as_deref() {
        paths.push(original);
    }
    paths
}

fn git_args_with_paths(prefix: &[&str], change: &WorkspaceChange) -> Vec<String> {
    prefix
        .iter()
        .map(|value| (*value).to_string())
        .chain(std::iter::once("--".to_string()))
        .chain(change_paths(change).into_iter().map(str::to_string))
        .collect()
}

fn truncate_patch(mut patch: String) -> (String, bool) {
    if patch.len() <= MAX_DIFF_BYTES {
        return (patch, false);
    }

    let mut boundary = MAX_DIFF_BYTES;
    while !patch.is_char_boundary(boundary) {
        boundary -= 1;
    }
    patch.truncate(boundary);
    patch.push_str("\n\n# Diff truncated by GrokDesk\n");
    (patch, true)
}

fn untracked_patch(root: &Path, change: &WorkspaceChange) -> Result<(String, bool, bool), String> {
    let file_path = validate_relative_path(root, &change.path)?;
    let metadata = fs::symlink_metadata(&file_path)
        .map_err(|error| format!("Could not inspect `{}`: {error}", change.path))?;
    if !metadata.file_type().is_file() {
        return Ok((
            format!("Binary or non-regular file: {}\n", change.path),
            true,
            false,
        ));
    }

    let mut bytes = Vec::new();
    File::open(&file_path)
        .map_err(|error| format!("Could not open `{}`: {error}", change.path))?
        .take((MAX_DIFF_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read `{}`: {error}", change.path))?;

    if bytes.iter().any(|byte| *byte == 0) {
        return Ok((format!("Binary file: {}\n", change.path), true, false));
    }

    let source = String::from_utf8_lossy(&bytes);
    let lines = source.lines().take(MAX_UNTRACKED_LINES).collect::<Vec<_>>();
    let line_truncated = source.lines().count() > lines.len();
    let mut patch = format!(
        "diff --git a/{0} b/{0}\nnew file mode 100644\n--- /dev/null\n+++ b/{0}\n@@ -0,0 +1,{1} @@\n",
        change.path,
        lines.len()
    );
    for line in lines {
        patch.push('+');
        patch.push_str(line);
        patch.push('\n');
    }
    if line_truncated {
        patch.push_str("\n# File preview truncated by GrokDesk\n");
    }
    let (patch, byte_truncated) = truncate_patch(patch);
    Ok((
        patch,
        false,
        line_truncated || byte_truncated || bytes.len() > MAX_DIFF_BYTES,
    ))
}

fn tracked_patch(root: &Path, change: &WorkspaceChange) -> Result<(String, bool, bool), String> {
    let mut sections = Vec::new();
    if change.staged {
        let args = git_args_with_paths(
            &[
                "diff",
                "--cached",
                "--no-color",
                "--no-ext-diff",
                "--unified=3",
            ],
            change,
        );
        let output = run_git_checked(root, args, "read the accepted diff")?;
        let patch = String::from_utf8_lossy(&output.stdout).into_owned();
        if !patch.is_empty() {
            sections.push(patch);
        }
    }
    if change.unstaged {
        let args = git_args_with_paths(
            &["diff", "--no-color", "--no-ext-diff", "--unified=3"],
            change,
        );
        let output = run_git_checked(root, args, "read the working-tree diff")?;
        let patch = String::from_utf8_lossy(&output.stdout).into_owned();
        if !patch.is_empty() {
            sections.push(patch);
        }
    }

    let combined = sections.join("\n");
    let binary = combined.contains("Binary files") || combined.contains("GIT binary patch");
    let (patch, truncated) = truncate_patch(combined);
    Ok((patch, binary, truncated))
}

fn unstage_change(root: &Path, change: &WorkspaceChange) -> Result<(), String> {
    let restore_args = git_args_with_paths(&["restore", "--staged"], change);
    let restore = run_git(root, restore_args)?;
    if restore.status.success() {
        return Ok(());
    }

    let reset_args = git_args_with_paths(&["reset", "-q", "HEAD"], change);
    let reset = run_git(root, reset_args)?;
    if reset.status.success() {
        return Ok(());
    }

    let remove_args = git_args_with_paths(&["rm", "--cached", "-r", "--ignore-unmatch"], change);
    let remove = run_git(root, remove_args)?;
    if remove.status.success() {
        Ok(())
    } else {
        Err(command_error("undo the accepted change", &restore))
    }
}

fn path_exists_in_head(root: &Path, relative: &str) -> Result<bool, String> {
    let output = run_git(
        root,
        ["ls-tree", "--name-only", "-z", "HEAD", "--", relative],
    )?;
    Ok(output.status.success() && !output.stdout.is_empty())
}

fn remove_untracked_file(root: &Path, relative: &str) -> Result<(), String> {
    let path = validate_relative_path(root, relative)?;
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("Could not inspect `{relative}` before reverting it: {error}"))?;
    if metadata.file_type().is_dir() {
        return Err(format!(
            "GrokDesk will not recursively delete the untracked directory `{relative}`. Remove it manually after reviewing its contents."
        ));
    }
    fs::remove_file(&path)
        .map_err(|error| format!("Could not delete untracked file `{relative}`: {error}"))
}

#[tauri::command]
pub fn inspect_workspace(cwd: String) -> Result<WorkspaceSnapshot, String> {
    inspect_workspace_internal(&cwd)
}

#[tauri::command]
pub fn get_workspace_diff(cwd: String, path: String) -> Result<WorkspaceDiff, String> {
    let (repository, change) = repository_change(&cwd, &path)?;
    let (patch, binary, truncated) = if change.status_code == "?" && !change.staged {
        untracked_patch(&repository.root, &change)?
    } else {
        tracked_patch(&repository.root, &change)?
    };

    Ok(WorkspaceDiff {
        path: change.path.clone(),
        status_code: change.status_code.clone(),
        staged: change.staged,
        unstaged: change.unstaged,
        patch,
        binary,
        truncated,
    })
}

#[tauri::command]
pub fn stage_workspace_change(cwd: String, path: String) -> Result<WorkspaceSnapshot, String> {
    let (repository, change) = repository_change(&cwd, &path)?;
    for relative in change_paths(&change) {
        validate_relative_path(&repository.root, relative)?;
    }
    let args = git_args_with_paths(&["add", "-A"], &change);
    run_git_checked(&repository.root, args, "accept the selected change")?;
    inspect_workspace_internal(&cwd)
}

#[tauri::command]
pub fn unstage_workspace_change(cwd: String, path: String) -> Result<WorkspaceSnapshot, String> {
    let (repository, change) = repository_change(&cwd, &path)?;
    if !change.staged {
        return inspect_workspace_internal(&cwd);
    }
    for relative in change_paths(&change) {
        validate_relative_path(&repository.root, relative)?;
    }
    unstage_change(&repository.root, &change)?;
    inspect_workspace_internal(&cwd)
}

#[tauri::command]
pub fn discard_workspace_change(cwd: String, path: String) -> Result<WorkspaceSnapshot, String> {
    let (repository, change) = repository_change(&cwd, &path)?;
    for relative in change_paths(&change) {
        validate_relative_path(&repository.root, relative)?;
    }

    let is_untracked = change.status_code == "?" && !change.staged;
    let is_new_file =
        change.original_path.is_none() && !path_exists_in_head(&repository.root, &change.path)?;

    if is_untracked {
        remove_untracked_file(&repository.root, &change.path)?;
    } else if is_new_file {
        if change.staged {
            unstage_change(&repository.root, &change)?;
        }
        if repository.root.join(&change.path).exists() {
            remove_untracked_file(&repository.root, &change.path)?;
        }
    } else {
        let args = git_args_with_paths(
            &["restore", "--source=HEAD", "--staged", "--worktree"],
            &change,
        );
        run_git_checked(&repository.root, args, "revert the selected change")?;
    }

    inspect_workspace_internal(&cwd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn create() -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after the epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "grokdesk-workspace-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn parses_modified_untracked_and_renamed_entries() {
        let changes =
            parse_porcelain_status(b" M src/main.rs\0?? notes.txt\0R  src/new.rs\0src/old.rs\0");

        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].path, "notes.txt");
        assert_eq!(changes[0].status_code, "?");
        assert!(changes[0].unstaged);
        let renamed = changes
            .iter()
            .find(|change| change.path == "src/new.rs")
            .expect("renamed file should be present");
        assert_eq!(renamed.original_path.as_deref(), Some("src/old.rs"));
        assert!(renamed.staged);
    }

    #[test]
    fn rejects_paths_that_escape_the_repository() {
        let directory = TestDirectory::create();
        assert!(validate_relative_path(&directory.0, "../outside.txt").is_err());
        assert!(validate_relative_path(&directory.0, "C:\\outside.txt").is_err());
    }

    #[test]
    fn stages_unstages_diffs_and_reverts_real_git_changes() {
        if git_executable().is_err() {
            return;
        }

        let directory = TestDirectory::create();
        run_git_checked(&directory.0, ["init", "-q"], "initialize test repository")
            .expect("git init should succeed");
        run_git_checked(
            &directory.0,
            ["config", "user.email", "grokdesk-tests@example.invalid"],
            "configure test email",
        )
        .expect("git config should succeed");
        run_git_checked(
            &directory.0,
            ["config", "user.name", "GrokDesk Tests"],
            "configure test name",
        )
        .expect("git config should succeed");
        run_git_checked(
            &directory.0,
            ["config", "core.autocrlf", "false"],
            "configure line endings",
        )
        .expect("git config should succeed");

        fs::write(directory.0.join("tracked.txt"), "before\n")
            .expect("tracked fixture should be written");
        run_git_checked(&directory.0, ["add", "tracked.txt"], "stage fixture")
            .expect("fixture should stage");
        run_git_checked(
            &directory.0,
            ["commit", "-q", "-m", "test baseline"],
            "commit fixture",
        )
        .expect("fixture should commit");

        fs::write(directory.0.join("tracked.txt"), "after\n").expect("tracked file should change");
        fs::write(directory.0.join("new.txt"), "new file\n")
            .expect("untracked file should be written");
        let cwd = directory.0.to_string_lossy().into_owned();

        let snapshot = inspect_workspace_internal(&cwd).expect("status should load");
        assert_eq!(snapshot.mode, "git");
        assert_eq!(snapshot.changes.len(), 2);
        let diff = get_workspace_diff(cwd.clone(), "tracked.txt".to_string())
            .expect("tracked diff should load");
        assert!(diff.patch.contains("-before"));
        assert!(diff.patch.contains("+after"));

        let staged = stage_workspace_change(cwd.clone(), "new.txt".to_string())
            .expect("new file should stage");
        assert!(staged
            .changes
            .iter()
            .find(|change| change.path == "new.txt")
            .is_some_and(|change| change.staged));

        let unstaged = unstage_workspace_change(cwd.clone(), "new.txt".to_string())
            .expect("new file should unstage");
        assert!(unstaged
            .changes
            .iter()
            .find(|change| change.path == "new.txt")
            .is_some_and(|change| !change.staged && change.unstaged));

        discard_workspace_change(cwd.clone(), "tracked.txt".to_string())
            .expect("tracked file should revert");
        assert_eq!(
            fs::read_to_string(directory.0.join("tracked.txt"))
                .expect("tracked file should remain"),
            "before\n"
        );
        discard_workspace_change(cwd, "new.txt".to_string())
            .expect("untracked file should be removed");
        assert!(!directory.0.join("new.txt").exists());

        run_git_checked(
            &directory.0,
            ["mv", "tracked.txt", "moved.txt"],
            "rename tracked fixture",
        )
        .expect("tracked fixture should be renamed");
        let renamed = inspect_workspace_internal(&directory.0.to_string_lossy())
            .expect("renamed status should load");
        let rename = renamed
            .changes
            .iter()
            .find(|change| change.path == "moved.txt")
            .expect("renamed file should be reported");
        assert_eq!(rename.original_path.as_deref(), Some("tracked.txt"));
        assert!(rename.staged);

        discard_workspace_change(
            directory.0.to_string_lossy().into_owned(),
            "moved.txt".to_string(),
        )
        .expect("renamed file should revert");
        assert!(directory.0.join("tracked.txt").exists());
        assert!(!directory.0.join("moved.txt").exists());
    }

    #[test]
    fn unstages_a_new_file_before_the_first_commit() {
        if git_executable().is_err() {
            return;
        }

        let directory = TestDirectory::create();
        run_git_checked(&directory.0, ["init", "-q"], "initialize test repository")
            .expect("git init should succeed");
        fs::write(directory.0.join("first.txt"), "first file\n")
            .expect("untracked fixture should be written");
        let cwd = directory.0.to_string_lossy().into_owned();

        let staged = stage_workspace_change(cwd.clone(), "first.txt".to_string())
            .expect("first file should stage");
        assert!(staged
            .changes
            .iter()
            .find(|change| change.path == "first.txt")
            .is_some_and(|change| change.staged));

        let unstaged = unstage_workspace_change(cwd, "first.txt".to_string())
            .expect("first file should unstage without HEAD");
        assert!(unstaged
            .changes
            .iter()
            .find(|change| change.path == "first.txt")
            .is_some_and(|change| !change.staged && change.unstaged));
    }
}
