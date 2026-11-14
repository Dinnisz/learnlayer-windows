//! The Windows implementation of `Platform`. Win32/WinRT code goes in this folder and nowhere else.

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
}
