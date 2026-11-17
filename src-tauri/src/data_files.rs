//! The app's own files in its data folder (`%APPDATA%\LearnLayer` on Windows, CLAUDE.md §4.4). The interface reads
//! and writes them by name; only the names below are allowed, so a page can never reach another path.

use std::path::{Path, PathBuf};

use crate::config;

/// Every file the app keeps, by name. Secrets are never here: they live in the platform's secret store.
pub const ALLOWED: &[&str] = &[
    "solutions.json",
    "escalated-answers.json",
    "explanations.json",
    "passages.json",
    "lessons.json",
    "illustrations.json",
    "fast-questions.json",
    "memory.json",
    "onboarding.json",
    "anywhere-log.jsonl",
    "cost-ledger.json",
    // Development only: the last Alt-click's reading, written by a dev build's stage to find what went wrong.
    "anywhere-debug.json",
];

fn path_for(directory: &Path, name: &str) -> Result<PathBuf, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("not an app data file: {name}"));
    }
    Ok(directory.join(name))
}

pub fn read(directory: &Path, name: &str) -> Result<Option<String>, String> {
    let path = path_for(directory, name)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// Written to a temporary file next to it, then renamed over it, so a crash never leaves half a file.
pub fn write(directory: &Path, name: &str, contents: &str) -> Result<(), String> {
    let path = path_for(directory, name)?;
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temporary = directory.join(format!(".{name}.tmp"));
    std::fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn data_file_read(name: String) -> Result<Option<String>, String> {
    read(&config::data_dir(), &name)
}

#[tauri::command]
pub fn data_file_write(name: String, contents: String) -> Result<(), String> {
    write(&config::data_dir(), &name, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let directory = std::env::temp_dir().join(format!("learnlayer-data-files-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        directory
    }

    #[test]
    fn reads_what_was_written_and_nothing_before() {
        let directory = scratch();
        assert_eq!(read(&directory, "solutions.json").unwrap(), None);
        write(&directory, "solutions.json", "{\"a\":1}").unwrap();
        assert_eq!(
            read(&directory, "solutions.json").unwrap().as_deref(),
            Some("{\"a\":1}")
        );
        write(&directory, "solutions.json", "{}").unwrap();
        assert_eq!(read(&directory, "solutions.json").unwrap().as_deref(), Some("{}"));
        assert!(!directory.join(".solutions.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn only_the_app_files_are_reachable() {
        let directory = scratch();
        for name in [
            "../secrets.txt",
            "C:\\Windows\\win.ini",
            "solutions.json/../x",
            "account.json",
            "",
        ] {
            assert!(read(&directory, name).is_err(), "{name}");
            assert!(write(&directory, name, "x").is_err(), "{name}");
        }
    }
}
