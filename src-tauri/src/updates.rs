//! Automatic updates (CLAUDE.md §4.6) with Tauri's updater. On only when the build carries the updater's settings
//! (`tauri.updater.conf.json`, merged by `scripts/build-installer.ps1`: the URL and the public key Dinis gives,
//! docs/PARA-O-DINIS.md point 5); otherwise the plugin is not even registered and nothing is asked of the network.
//!
//! A check runs at launch and every six hours. A new version is downloaded (and its signature checked) in the
//! background; the main window then offers "Restart to update", and installing it is the student's click.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The downloaded update, waiting for the student's click.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<(Update, Vec<u8>)>>);

/// True when this build was made with the updater's settings.
pub fn configured<R: Runtime>(context: &tauri::Context<R>) -> bool {
    context.config().plugins.0.contains_key("updater")
}

/// Checks now and every six hours; a found update is downloaded, then the windows are told its version.
/// `PendingUpdate` is managed by the app in every build, so the two commands always find it.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Some(version) = fetch(&app).await {
                let _ = app.emit("update-ready", version);
                break;
            }
            tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
        }
    });
}

async fn fetch(app: &AppHandle) -> Option<String> {
    let update = app.updater().ok()?.check().await.ok()??;
    let bytes = update.download(|_, _| {}, || {}).await.ok()?;
    let version = update.version.clone();
    let pending = app.try_state::<PendingUpdate>()?;
    *pending.0.lock().ok()? = Some((update, bytes));
    Some(version)
}

/// "Restart to update": installs the downloaded version (the installer closes the app) and starts it again.
#[tauri::command]
pub fn update_install(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let taken = pending.0.lock().map_err(|error| error.to_string())?.take();
    let Some((update, bytes)) = taken else {
        return Err("no update is ready".into());
    };
    update.install(bytes).map_err(|error| error.to_string())?;
    app.restart();
}

/// The version waiting to be installed, for a window opened after the news went out.
#[tauri::command]
pub fn update_ready(pending: State<'_, PendingUpdate>) -> Option<String> {
    let guard = pending.0.lock().ok()?;
    guard.as_ref().map(|(update, _)| update.version.clone())
}
