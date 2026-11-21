//! Everything that depends on the operating system lives under this module, behind `Platform`.
//! The rest of the native side (session, API, config, tray) and the whole interface never name an OS.
//! Windows is complete; `platform/macos/` is stage 1 of the Mac port (the app runs, ⌥-click comes later).

use std::path::PathBuf;

use tauri::AppHandle;

use crate::session::SecretStore;

#[cfg(target_os = "macos")]
pub mod macos;
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
    /// Alt-click in any app (⌥-click on a Mac): the stage window, the global hooks and the reader of other apps.
    fn start_anywhere(&self, app: &AppHandle, enabled: bool) -> Result<(), String>;
    /// The Settings switch: off, every click passes through untouched.
    fn set_anywhere_enabled(&self, enabled: bool);
    /// The pixels of a click's window picture (4 bytes a pixel, blue first), for the stage to find the question in.
    fn anywhere_picture(&self, id: u64) -> Option<Vec<u8>>;
    /// The bytes of the PDF found behind a click's window; read here, never sent anywhere.
    fn anywhere_pdf(&self, id: u64) -> Option<Vec<u8>>;
    /// Hides the stage over the other app and gives that app its keyboard back.
    fn close_overlay(&self, app: &AppHandle);
    /// The stage takes the mouse and keyboard (a question is open), or lets every click through (only a word shows).
    fn overlay_interactive(&self, app: &AppHandle, interactive: bool);
    /// "Explain selected text" in the pill: the text selected in the app in front opens in the stage.
    fn explain_selection(&self, app: &AppHandle);
    /// "Capture an area" in the pill: the monitor under the pointer is frozen for the student to drag a rectangle on.
    fn capture_area(&self, app: &AppHandle);
    /// The OCR lines (`[{text, rect}]`) of a dragged part of a capture's picture, in its pixels.
    fn capture_text(&self, id: u64, x: i32, y: i32, width: i32, height: i32) -> serde_json::Value;
    /// Which keys talk to the tutor: "controlWindows" (default), "copilot" or "rightControl" (CLAUDE.md §4.3).
    fn set_talk_key(&self, key: &str);
    /// Development only: the OpenRouter key kept by the system for direct calls (CLAUDE.md §5.5). Never in release.
    fn local_openrouter_key(&self) -> Option<String>;
}

#[cfg(windows)]
pub fn current() -> &'static dyn Platform {
    &windows::WindowsPlatform
}

#[cfg(target_os = "macos")]
pub fn current() -> &'static dyn Platform {
    &macos::MacPlatform
}

#[cfg(not(any(windows, target_os = "macos")))]
compile_error!(
    "Only Windows and macOS are implemented. Add platform/<os>/ with a `Platform` and return it from `current()`."
);

#[tauri::command]
pub fn pill_resize(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    current().resize_pill(&app, width, height)
}

#[tauri::command]
pub fn anywhere_set_enabled(enabled: bool) {
    current().set_anywhere_enabled(enabled);
}

/// Raw bytes, not JSON: a window picture is megabytes.
#[tauri::command]
pub fn anywhere_picture(id: u64) -> Result<tauri::ipc::Response, String> {
    current()
        .anywhere_picture(id)
        .map(tauri::ipc::Response::new)
        .ok_or_else(|| "no picture for that click".to_string())
}

#[tauri::command]
pub fn anywhere_pdf(id: u64) -> Result<tauri::ipc::Response, String> {
    current()
        .anywhere_pdf(id)
        .map(tauri::ipc::Response::new)
        .ok_or_else(|| "no PDF for that click".to_string())
}

#[tauri::command]
pub fn anywhere_close(app: AppHandle) {
    current().close_overlay(&app);
}

#[tauri::command]
pub fn anywhere_interactive(app: AppHandle, interactive: bool) {
    current().overlay_interactive(&app, interactive);
}

#[tauri::command]
pub fn anywhere_explain_selection(app: AppHandle) {
    current().explain_selection(&app);
}

#[tauri::command]
pub fn anywhere_capture_area(app: AppHandle) {
    current().capture_area(&app);
}

#[tauri::command]
pub fn anywhere_capture_text(id: u64, x: i32, y: i32, width: i32, height: i32) -> serde_json::Value {
    current().capture_text(id, x, y, width, height)
}

#[tauri::command]
pub fn local_openrouter_key() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    current().local_openrouter_key()
}

#[tauri::command]
pub fn talk_key_set(key: String) {
    current().set_talk_key(&key);
}
