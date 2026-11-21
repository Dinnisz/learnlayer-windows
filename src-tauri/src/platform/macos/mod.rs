//! The macOS implementation of `Platform`. AppKit/Core Graphics code goes in this folder and nowhere else.
//!
//! The Mac's native work (⌥-click, Accessibility, window pictures, Vision OCR, the notch, the talk key) is the Swift
//! app's own code, kept in the Swift package `src-tauri/macos-native/` and called through `native`.
//!
//! The Swift app stays the Mac product. To never touch its data, this build keeps its own folder
//! (`~/Library/Application Support/LearnLayer Desktop`), its own Keychain items (`LearnLayerDesktop.*`)
//! and its own bundle identifier (`tauri.macos.conf.json`).

pub mod anywhere;
pub mod keychain;
mod native;
pub mod overlay;
pub mod pill;

use std::path::PathBuf;
use std::process::Command;

use tauri::AppHandle;

use crate::session::SecretStore;

/// Not `LearnLayer`: that folder belongs to the Swift app.
const DATA_FOLDER: &str = "LearnLayer Desktop";

/// The app, for the Settings switch (whose call carries none).
static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

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

    fn start_anywhere(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        let _ = APP.set(app.clone());
        anywhere::start(app, enabled)
    }

    fn set_anywhere_enabled(&self, enabled: bool) {
        if let Some(app) = APP.get() {
            anywhere::set_enabled(app, enabled);
        }
    }

    fn anywhere_picture(&self, id: u64) -> Option<Vec<u8>> {
        anywhere::picture(id)
    }

    fn anywhere_pdf(&self, id: u64) -> Option<Vec<u8>> {
        anywhere::pdf(id)
    }

    fn close_overlay(&self, app: &AppHandle) {
        overlay::close(app);
    }

    fn overlay_interactive(&self, app: &AppHandle, interactive: bool) {
        overlay::set_interactive(app, interactive);
    }

    fn explain_selection(&self, app: &AppHandle) {
        anywhere::explain_selection(app);
    }

    fn capture_area(&self, app: &AppHandle) {
        anywhere::capture_area(app);
    }

    fn capture_text(&self, id: u64, x: i32, y: i32, width: i32, height: i32) -> serde_json::Value {
        serde_json::to_value(anywhere::capture_text(id, x, y, width, height))
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new()))
    }

    /// Control + Option held, as in the Swift app; "none" turns it off.
    fn set_talk_key(&self, key: &str) {
        anywhere::set_talk_key(key);
    }

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
