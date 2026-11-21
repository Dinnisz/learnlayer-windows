//! The stage over another app on the Mac (the `StagePanel` of LearnLayer/Anywhere/AnywhereController.swift @ e0af40f,
//! and the Mac side of `platform/windows/anywhere/overlay.rs`): a borderless, see-through window above ordinary
//! windows, on every Space, that covers the screen of the click. While only a word near the cursor shows
//! («Reading…») every click goes through it; with a question open it takes the mouse and the keyboard, and the
//! system's material blurs the app below. Closing gives the keyboard back to that app.

use std::sync::atomic::{AtomicI32, Ordering};

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState};

use super::native;

pub const LABEL: &str = "overlay";

/// The app that had the keyboard before the stage took it.
static PREVIOUS: AtomicI32 = AtomicI32::new(0);

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
        .title("LearnLayer")
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
        native::configure_overlay(ns_window);
    }
    let _ = window.set_ignore_cursor_events(true);
    see_through(&window, true);
    Ok(window)
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Tells the ⌥-click tap whether a click on the stage goes through it (it is only showing a word) or is the stage's.
fn see_through(window: &WebviewWindow, through: bool) {
    let number = window.ns_window().map(native::window_number).unwrap_or(0);
    native::tap_set_see_through(if through { number } else { 0 });
}

/// Out of the way while the app below is read: Accessibility must find that app's element under the point.
pub fn hide_for_reading(app: &AppHandle) {
    if let Some(window) = window(app) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            std::thread::sleep(std::time::Duration::from_millis(40));
        }
    }
}

/// The part of `monitor` the stage covers, in pixels (x, y, width, height): all of it but the menu bar, which stays
/// above every window and would hide the stage's top (the work area's top edge; the Dock is left under the stage).
pub fn stage_area(monitor: &Monitor) -> (f64, f64, f64, f64) {
    let (x, y) = (f64::from(monitor.position().x), f64::from(monitor.position().y));
    let (width, height) = (f64::from(monitor.size().width), f64::from(monitor.size().height));
    let work_top = f64::from(monitor.work_area().position.y);
    let menu_bar = (work_top - y).clamp(0.0, height / 4.0);
    (x, y + menu_bar, width, height - menu_bar)
}

/// Covers `monitor` below its menu bar, letting clicks through until the interface opens a question.
pub fn show_on(app: &AppHandle, monitor: &Monitor) {
    let Some(window) = window(app) else { return };
    let scale = monitor.scale_factor();
    let (x, y, width, height) = stage_area(monitor);
    let _ = window.set_ignore_cursor_events(true);
    see_through(&window, true);
    let _ = window.set_position(LogicalPosition::new(x / scale, y / scale));
    let _ = window.set_size(LogicalSize::new(width / scale, height / scale));
    let _ = window.show();
    native::tap_set_intercepts_escape(true);
}

/// A question opens (true): the stage takes the mouse and the keyboard, the app below is blurred. Only a word near
/// the cursor (false): every click goes through.
pub fn set_interactive(app: &AppHandle, interactive: bool) {
    let Some(window) = window(app) else { return };
    let _ = window.set_ignore_cursor_events(!interactive);
    see_through(&window, !interactive);
    if interactive {
        if let Some(front) = native::front_app() {
            if front.pid != std::process::id() as i32 {
                PREVIOUS.store(front.pid, Ordering::SeqCst);
            }
        }
        // With Reduce Transparency on, the system draws the material as a plain colour by itself.
        let _ = window_vibrancy::apply_vibrancy(
            &window,
            NSVisualEffectMaterial::HudWindow,
            Some(NSVisualEffectState::Active),
            None,
        );
        let _ = window.set_focus();
    }
}

/// Esc, or the stage closed: hidden, Esc given back, and the keyboard back to the app that had it.
pub fn close(app: &AppHandle) {
    native::tap_set_intercepts_escape(false);
    let Some(window) = window(app) else { return };
    let _ = window_vibrancy::clear_vibrancy(&window);
    let _ = window.set_ignore_cursor_events(true);
    see_through(&window, true);
    let _ = window.hide();
    let previous = PREVIOUS.swap(0, Ordering::SeqCst);
    if previous != 0 {
        native::activate(previous);
    }
}
