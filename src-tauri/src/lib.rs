//! The native side of LearnLayer for Windows: only what needs Windows, behind small commands.

pub mod config;

use config::AppConfig;

/// Where the API and the site are, and whether this is a debug build. The interface asks once at start.
#[tauri::command]
fn app_config() -> AppConfig {
    AppConfig::current()
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_config])
        .run(tauri::generate_context!())
        .expect("error while running LearnLayer");
}
