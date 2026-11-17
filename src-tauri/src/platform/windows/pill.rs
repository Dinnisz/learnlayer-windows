//! The black pill at the top of the main monitor (the Mac's notch): always on top, never takes the
//! focus, not in Alt-Tab or the taskbar. Port of the window half of LearnLayer/Notch/NotchPillController.swift
//! @ ref 2026-11-04; the drawing is `ui/windows/pill/`.

use std::ffi::c_void;

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "pill";
/// At rest (CLAUDE.md §7: about 180×32).
pub const IDLE_WIDTH: f64 = 180.0;
pub const IDLE_HEIGHT: f64 = 32.0;

const GWL_EXSTYLE: i32 = -20;
const WS_EX_TOOLWINDOW: isize = 0x0000_0080;
const WS_EX_NOACTIVATE: isize = 0x0800_0000;

#[link(name = "user32")]
extern "system" {
    fn GetWindowLongPtrW(hwnd: *mut c_void, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: *mut c_void, index: i32, value: isize) -> isize;
}

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("pill.html".into()))
        .title("LearnLayer")
        .inner_size(IDLE_WIDTH, IDLE_HEIGHT)
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
    keep_out_of_alt_tab(&window);
    place(&window, IDLE_WIDTH, IDLE_HEIGHT)?;
    window.show()?;
    Ok(window)
}

/// A tool window is not listed in Alt-Tab; no-activate keeps the app underneath in front when
/// the pointer only passes over the pill.
fn keep_out_of_alt_tab(window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else { return };
    let handle = hwnd.0;
    // SAFETY: `handle` is the live top-level window Tauri just created, on the thread that owns it.
    unsafe {
        let style = GetWindowLongPtrW(handle, GWL_EXSTYLE);
        SetWindowLongPtrW(handle, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
    }
}

/// Sizes the pill and centres it on the top edge of the primary monitor, at that monitor's scale.
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
