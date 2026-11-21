//! The black pill at the top of the main screen. Stage 1: an always-on-top window centred under the
//! menu bar, on every Space. Living in the notch itself (above the menu bar, as the Swift app's
//! NotchPillController does) needs an AppKit window level and comes with stage 2.

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "pill";
/// At rest, as on Windows (CLAUDE.md §7: about 180×32).
pub const IDLE_WIDTH: f64 = 180.0;
pub const IDLE_HEIGHT: f64 = 32.0;

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    // Not transparent: a transparent window on macOS needs Tauri's private-API feature. The pill is drawn
    // black on a black window, so only its rounded corners differ.
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("pill.html".into()))
        .title("LearnLayer")
        .inner_size(IDLE_WIDTH, IDLE_HEIGHT)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()?;
    place(&window, IDLE_WIDTH, IDLE_HEIGHT)?;
    window.show()?;
    Ok(window)
}

/// Sizes the pill and centres it on the top edge of the main screen; macOS keeps it under the menu bar.
pub fn place(window: &WebviewWindow, width: f64, height: f64) -> tauri::Result<()> {
    window.set_size(LogicalSize::new(width, height))?;
    let Some(monitor) = window.primary_monitor()? else {
        return Ok(());
    };
    let physical_width = (width * monitor.scale_factor()).round() as i32;
    let x = monitor.position().x + (monitor.size().width as i32 - physical_width) / 2;
    window.set_position(PhysicalPosition::new(x, monitor.position().y))
}

/// The interface asks for room when the pill opens downward, and gives it back when it closes.
pub fn resize(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("no pill window")?;
    let width = width.clamp(IDLE_WIDTH, 720.0);
    let height = height.clamp(IDLE_HEIGHT, 480.0);
    place(&window, width, height).map_err(|error| error.to_string())
}
