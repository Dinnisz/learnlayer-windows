//! Everything that depends on the operating system lives under this module, behind `Platform`.
//! The rest of the native side (session, API, config, tray) and the whole interface never name an OS.
//! Only Windows exists today; a Mac port adds `platform/macos/` and one line in `current()`.

use std::path::PathBuf;

use tauri::AppHandle;

use crate::session::SecretStore;

#[cfg(windows)]
pub mod windows;

/// What the app asks of the operating system. Grows phase by phase (mouse hook, UI Automation,
/// OCR, acrylic, system voice); each addition is a method here and an implementation per OS.
pub trait Platform: Send + Sync + 'static {
    /// "windows" or "macos": the interface picks its wording, shortcuts and glyphs from this.
    fn name(&self) -> &'static str;
    /// Where the app keeps its files (`%APPDATA%\LearnLayer`, `~/Library/Application Support/LearnLayer`).
    fn data_dir(&self) -> PathBuf;
    /// The computer's name, for the device list of the account.
    fn computer_name(&self) -> String;
    /// Where secrets are kept (Credential Manager, Keychain). Never a file.
    fn secret_store(&self) -> Box<dyn SecretStore>;
    /// The always-on-top pill at the top of the main monitor (the notch on a Mac).
    fn create_pill(&self, app: &AppHandle) -> tauri::Result<()>;
    /// Resizes the pill when it opens downward or closes.
    fn resize_pill(&self, app: &AppHandle, width: f64, height: f64) -> Result<(), String>;
}

#[cfg(windows)]
pub fn current() -> &'static dyn Platform {
    &windows::WindowsPlatform
}

#[cfg(not(windows))]
compile_error!("Only Windows is implemented. Add platform/<os>/ with a `Platform` and return it from `current()`.");

#[tauri::command]
pub fn pill_resize(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    current().resize_pill(&app, width, height)
}
