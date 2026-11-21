//! The black pill in the notch of the main screen (LearnLayer/Notch/NotchPillController.swift @ e0af40f, placed by
//! `NotchPill.swift`): a see-through window at the menu bar's level, centred on the notch with its top on the
//! screen's edge, on every Space. On a screen without a notch it sits at the top centre of the menu bar. The
//! interface draws the pill around the notch (ui/windows/pill), and asks for room when it opens downward.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::native;

pub const LABEL: &str = "pill";
/// At rest before the interface knows the notch: the Windows pill's size.
pub const IDLE_WIDTH: f64 = 180.0;
pub const IDLE_HEIGHT: f64 = 32.0;

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("pill.html".into()))
        .title("LearnLayer")
        .inner_size(IDLE_WIDTH, IDLE_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .build()?;
    if let Ok(ns_window) = window.ns_window() {
        native::configure_pill(ns_window);
        native::place_pill(ns_window, IDLE_WIDTH, IDLE_HEIGHT);
    }
    window.show()?;
    Ok(window)
}

/// The interface asks for room when the pill opens downward, and gives it back when it closes.
pub fn resize(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window(LABEL).ok_or("no pill window")?;
    let width = width.clamp(80.0, 720.0);
    let height = height.clamp(20.0, 480.0);
    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    native::place_pill(ns_window, width, height);
    Ok(())
}
