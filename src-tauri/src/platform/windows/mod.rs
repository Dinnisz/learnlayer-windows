//! The Windows implementation of `Platform`. Win32/WinRT code goes in this folder and nowhere else.

pub mod anywhere;
pub mod credentials;
pub mod pill;

use std::path::PathBuf;

use tauri::AppHandle;

use crate::session::SecretStore;

pub struct WindowsPlatform;

impl super::Platform for WindowsPlatform {
    fn name(&self) -> &'static str {
        "windows"
    }

    /// `%APPDATA%\LearnLayer`, the counterpart of `~/Library/Application Support/LearnLayer`.
    fn data_dir(&self) -> PathBuf {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        base.join("LearnLayer")
    }

    fn computer_name(&self) -> String {
        std::env::var("COMPUTERNAME").unwrap_or_default()
    }

    fn secret_store(&self) -> Box<dyn SecretStore> {
        Box::new(credentials::CredentialManager)
    }

    fn create_pill(&self, app: &AppHandle) -> tauri::Result<()> {
        pill::create(app).map(|_| ())
    }

    fn resize_pill(&self, app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
        pill::resize(app, width, height)
    }

    fn start_anywhere(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        anywhere::start(app, enabled)
    }

    fn set_anywhere_enabled(&self, enabled: bool) {
        anywhere::hook::set_enabled(enabled);
    }

    fn anywhere_picture(&self, id: u64) -> Option<Vec<u8>> {
        anywhere::picture(id)
    }

    fn anywhere_pdf(&self, id: u64) -> Option<Vec<u8>> {
        anywhere::pdf(id)
    }

    fn close_overlay(&self, app: &AppHandle) {
        anywhere::overlay::close(app);
    }

    fn overlay_interactive(&self, app: &AppHandle, interactive: bool) {
        anywhere::overlay::set_interactive(app, interactive);
    }

    fn explain_selection(&self, app: &AppHandle) {
        anywhere::explain_selection(app);
    }

    fn capture_area(&self, app: &AppHandle) {
        anywhere::capture_area(app);
    }

    fn capture_text(&self, id: u64, x: i32, y: i32, width: i32, height: i32) -> serde_json::Value {
        serde_json::to_value(anywhere::capture_text(id, x, y, width, height)).unwrap_or_default()
    }

    fn set_talk_key(&self, key: &str) {
        anywhere::hook::set_talk_key(match key {
            "copilot" => anywhere::hook::TalkKey::Copilot,
            "rightControl" => anywhere::hook::TalkKey::RightControl,
            "none" => anywhere::hook::TalkKey::None,
            _ => anywhere::hook::TalkKey::ControlWindows,
        });
    }

    /// `LearnLayer.OpenRouter` in the Credential Manager (a generic credential, the key as its password).
    fn local_openrouter_key(&self) -> Option<String> {
        let entry =
            keyring::Entry::new_with_target("LearnLayer.OpenRouter", "LearnLayer.OpenRouter", "openrouter").ok()?;
        entry
            .get_password()
            .ok()
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty())
    }
}
