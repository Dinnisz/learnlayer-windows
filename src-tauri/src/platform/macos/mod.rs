//! The macOS implementation of `Platform`. AppKit/Core Graphics code goes in this folder and nowhere else.
//!
//! Stage 1 of the Mac port: the app runs natively on a Mac (main window, account, documents, PDF reader,
//! the stage opened from the pill), so the shared code can be built and tried on both systems.
//! ⌥-click in other apps, the screen OCR and "Capture an area" are not here yet: they answer that they
//! are unavailable, and the rest of the app carries on, as it does on Windows when the hooks can't start.
//!
//! The Swift app stays the Mac product. To never touch its data, this build keeps its own folder
//! (`~/Library/Application Support/LearnLayer Desktop`), its own Keychain items (`LearnLayerDesktop.*`)
//! and its own bundle identifier (`tauri.macos.conf.json`).

pub mod keychain;
pub mod pill;

use std::path::PathBuf;
use std::process::Command;

use tauri::AppHandle;

use crate::session::SecretStore;

/// Not `LearnLayer`: that folder belongs to the Swift app.
const DATA_FOLDER: &str = "LearnLayer Desktop";
const UNAVAILABLE: &str = "⌥-click is not available in the Mac build yet";

pub struct MacPlatform;

impl super::Platform for MacPlatform {
    fn name(&self) -> &'static str {
        "macos"
    }

    /// `~/Library/Application Support/LearnLayer Desktop`.
    fn data_dir(&self) -> PathBuf {
        let base = std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join("Library").join("Application Support"))
            .unwrap_or_else(std::env::temp_dir);
        base.join(DATA_FOLDER)
    }

    /// The name in System Settings › General › Sharing, as the Swift app sends it; the host name if that fails.
    fn computer_name(&self) -> String {
        let sharing_name = Command::new("scutil")
            .args(["--get", "ComputerName"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty());
        sharing_name.unwrap_or_else(|| std::env::var("HOSTNAME").unwrap_or_default())
    }

    fn secret_store(&self) -> Box<dyn SecretStore> {
        Box::new(keychain::Keychain)
    }

    fn create_pill(&self, app: &AppHandle) -> tauri::Result<()> {
        pill::create(app).map(|_| ())
    }

    fn resize_pill(&self, app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
        pill::resize(app, width, height)
    }

    fn start_anywhere(&self, _app: &AppHandle, _enabled: bool) -> Result<(), String> {
        Err(UNAVAILABLE.to_string())
    }

    fn set_anywhere_enabled(&self, _enabled: bool) {}

    fn anywhere_picture(&self, _id: u64) -> Option<Vec<u8>> {
        None
    }

    fn anywhere_pdf(&self, _id: u64) -> Option<Vec<u8>> {
        None
    }

    fn close_overlay(&self, _app: &AppHandle) {}

    fn overlay_interactive(&self, _app: &AppHandle, _interactive: bool) {}

    fn explain_selection(&self, _app: &AppHandle) {
        eprintln!("Explain selected text: {UNAVAILABLE}");
    }

    fn capture_area(&self, _app: &AppHandle) {
        eprintln!("Capture an area: {UNAVAILABLE}");
    }

    /// No OCR yet: no lines.
    fn capture_text(&self, _id: u64, _x: i32, _y: i32, _width: i32, _height: i32) -> serde_json::Value {
        serde_json::Value::Array(Vec::new())
    }

    /// The talk key needs a global key monitor, which comes with ⌥-click.
    fn set_talk_key(&self, _key: &str) {}

    /// `LearnLayerDesktop.OpenRouter` in the login Keychain, for debug builds only (CLAUDE.md §5.5).
    /// `security add-generic-password -s LearnLayerDesktop.OpenRouter -a openrouter -w <key>`
    fn local_openrouter_key(&self) -> Option<String> {
        let entry = keyring::Entry::new("LearnLayerDesktop.OpenRouter", "openrouter").ok()?;
        entry
            .get_password()
            .ok()
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty())
    }
}
