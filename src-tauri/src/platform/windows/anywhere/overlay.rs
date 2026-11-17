//! The stage over another app: a borderless, always-on-top window that covers the monitor of the click (the
//! `StagePanel` of AnywhereController.swift @ ref 2026-11-04). Made hidden at start, so it opens at once. While only a
//! word near the cursor shows («Reading…») it lets every click through; with a question open it takes the mouse and
//! the keyboard, and the system's acrylic blurs the app below. Closing gives the keyboard back to that app.

use std::ffi::c_void;
use std::sync::atomic::{AtomicIsize, Ordering};

use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
};

use super::hook;

pub const LABEL: &str = "overlay";

/// The window that had the keyboard before the stage took it.
static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
        .title("LearnLayer")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .build()?;
    if let Ok(handle) = window.hwnd() {
        // SAFETY: the live top-level window just made, on its own thread: kept out of Alt-Tab.
        unsafe {
            let hwnd = HWND(handle.0);
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW.0 as isize);
        }
        hook::set_overlay_window(handle.0 as isize);
    }
    Ok(window)
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Out of the way while the app below is read: the point (and its picture) must be that app's.
pub fn hide_for_reading(app: &AppHandle) {
    if let Some(window) = window(app) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            std::thread::sleep(std::time::Duration::from_millis(40));
        }
    }
}

/// Covers `monitor`, letting clicks through until the interface opens a question.
pub fn show_on(app: &AppHandle, monitor: &Monitor) {
    let Some(window) = window(app) else { return };
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_position(PhysicalPosition::new(monitor.position().x, monitor.position().y));
    let _ = window.set_size(PhysicalSize::new(monitor.size().width, monitor.size().height));
    let _ = window.show();
    hook::set_intercepts_escape(true);
}

/// A question opens (true): the stage takes the mouse and the keyboard, the app below is blurred. Only a word
/// near the cursor (false): every click goes through.
pub fn set_interactive(app: &AppHandle, interactive: bool) {
    let Some(window) = window(app) else { return };
    let _ = window.set_ignore_cursor_events(!interactive);
    if interactive {
        // SAFETY: reads which window has the keyboard now.
        let previous = unsafe { GetForegroundWindow() };
        if let Ok(own) = window.hwnd() {
            if !std::ptr::eq(previous.0, own.0) {
                PREVIOUS.store(previous.0 as isize, Ordering::SeqCst);
            }
        }
        // With transparency effects off in Windows, the system draws acrylic as a plain colour by itself.
        let _ = window_vibrancy::apply_acrylic(&window, Some((12, 12, 12, 110)));
        let _ = window.set_focus();
    }
}

/// Esc, or the stage closed: hidden, Esc given back, and the keyboard back to the app that had it.
pub fn close(app: &AppHandle) {
    hook::set_intercepts_escape(false);
    let Some(window) = window(app) else { return };
    let _ = window_vibrancy::clear_acrylic(&window);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.hide();
    let previous = PREVIOUS.swap(0, Ordering::SeqCst);
    if previous != 0 {
        // SAFETY: a window handle saved when the stage opened; if it is gone the call just fails.
        unsafe {
            let _ = SetForegroundWindow(HWND(previous as *mut c_void));
        }
    }
}
