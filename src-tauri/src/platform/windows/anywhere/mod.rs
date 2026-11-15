//! Alt-click in any app (CLAUDE.md §3.1): the Windows side of LearnLayer/Anywhere/AnywhereController.swift
//! @ ref 2026-11-04. The hooks see the click (`hook`); a worker thread reads what is there — a picture of the window
//! and its OCR lines (`capture`, `ocr`), UI Automation's text (`uia`), the PDF the window shows (`pdf_path`) — and hands
//! it all to the stage window (`overlay`), whose TypeScript decides which question it is and opens it. Nothing is
//! shown before the click, nothing is read from password fields or exam browsers, and only the clicked question's
//! region ever goes to the model.

pub mod capture;
pub mod hook;
pub mod ocr;
pub mod overlay;
pub mod pdf_path;
pub mod uia;

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Monitor};
use windows::Win32::Foundation::POINT;

use capture::Picture;

/// Exam browsers and password managers: nothing is read in them (CLAUDE.md §2.12).
const PROTECTED: &[&str] = &[
    "safeexambrowser.exe",
    "safeexambrowser.client.exe",
    "seb.exe",
    "lockdownbrowser.exe",
    "lockdownbrowseroem.exe",
    "respondus lockdown browser.exe",
    "keepass.exe",
    "keepassxc.exe",
    "1password.exe",
    "bitwarden.exe",
];

/// Whether nothing may be read in this app.
pub fn is_protected(executable: &str) -> bool {
    PROTECTED.contains(&executable.to_ascii_lowercase().as_str())
}

/// What a click left for the interface to fetch: its window's pixels and its PDF. The last few clicks are kept.
struct Kept {
    id: u64,
    picture: Option<Picture>,
    pdf: Option<PathBuf>,
}

static KEPT: Mutex<VecDeque<Kept>> = Mutex::new(VecDeque::new());
static NEXT_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Clone, Copy)]
struct PixelPoint {
    x: f64,
    y: f64,
}

#[derive(Serialize, Clone, Copy)]
struct PixelRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ClickPayload {
    point: PixelPoint,
    scale: f64,
    monitor: PixelRect,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WindowPayload {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    pixel_width: i32,
    pixel_height: i32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReadPayload {
    id: u64,
    point: PixelPoint,
    monitor: PixelRect,
    scale: f64,
    app_name: String,
    /// "protected" when the app is one nothing is read in.
    refused: Option<&'static str>,
    found: Option<uia::Reading>,
    selection: Option<uia::Selection>,
    window: Option<WindowPayload>,
    lines: Vec<ocr::Line>,
    pdf_path: Option<String>,
}

fn monitor_rect(monitor: &Monitor) -> PixelRect {
    PixelRect {
        x: f64::from(monitor.position().x),
        y: f64::from(monitor.position().y),
        width: f64::from(monitor.size().width),
        height: f64::from(monitor.size().height),
    }
}

/// Starts listening for Alt-click: the stage window, the hooks, and the thread that answers them.
pub fn start(app: &AppHandle, enabled: bool) -> Result<(), String> {
    overlay::create(app).map_err(|error| error.to_string())?;
    let (sender, receiver) = mpsc::channel();
    hook::start(sender)?;
    hook::set_enabled(enabled);
    let app = app.clone();
    std::thread::Builder::new()
        .name("learnlayer-anywhere".into())
        .spawn(move || {
            for event in receiver {
                match event {
                    hook::HookEvent::AltClick { x, y } | hook::HookEvent::ReadUnderPointer { x, y } => {
                        let app = app.clone();
                        std::thread::spawn(move || read_click(&app, x, y));
                    }
                    hook::HookEvent::Escape => {
                        let _ = app.emit_to(overlay::LABEL, "anywhere-escape", ());
                    }
                    hook::HookEvent::TalkBegan => {
                        let _ = app.emit("talk", true);
                    }
                    hook::HookEvent::TalkEnded => {
                        let _ = app.emit("talk", false);
                    }
                    hook::HookEvent::Removed => {
                        // The pill says how to turn it back on if it stays off (`onFailSafe` on the Mac).
                        let _ = app.emit("anywhere-hook-removed", ());
                    }
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// One click: read everything that can be read there, keep the pixels and the PDF for the interface, and hand over.
fn read_click(app: &AppHandle, x: i32, y: i32) {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let Ok(Some(monitor)) = app.monitor_from_point(f64::from(x), f64::from(y)) else {
        return;
    };
    let scale = monitor.scale_factor();
    let point = PixelPoint {
        x: f64::from(x),
        y: f64::from(y),
    };
    let _ = app.emit_to(
        overlay::LABEL,
        "anywhere-click",
        ClickPayload {
            point,
            scale,
            monitor: monitor_rect(&monitor),
        },
    );
    overlay::hide_for_reading(app);
    let at = POINT { x, y };
    let target = capture::window_at(at, overlay_handle(app));
    let app_name = target
        .as_ref()
        .map(|window| window.executable.clone())
        .unwrap_or_default();
    let mut payload = ReadPayload {
        id,
        point,
        monitor: monitor_rect(&monitor),
        scale,
        app_name,
        refused: None,
        found: None,
        selection: None,
        window: None,
        lines: Vec::new(),
        pdf_path: None,
    };
    // «Reading…» if it takes a while: the stage shows, letting clicks through, while UI Automation answers.
    let shown = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let (app, monitor, shown) = (app.clone(), monitor.clone(), shown.clone());
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(350));
            if NEXT_ID.load(Ordering::SeqCst) == id && !shown.swap(true, Ordering::SeqCst) {
                overlay::show_on(&app, &monitor);
            }
        });
    }
    if let Some(window) = target.as_ref().filter(|window| is_protected(&window.executable)) {
        payload.refused = Some("protected");
        payload.app_name = window.executable.clone();
    } else {
        // The picture first: it is quick, and drawn by the window itself, so the stage never gets in it.
        let picture = target.as_ref().and_then(capture::picture);
        if let (Some(window), Some(picture)) = (target.as_ref(), picture.as_ref()) {
            payload.lines = ocr::lines(picture);
            payload.window = Some(WindowPayload {
                x: f64::from(window.frame.left),
                y: f64::from(window.frame.top),
                width: f64::from(window.frame.right - window.frame.left),
                height: f64::from(window.frame.bottom - window.frame.top),
                pixel_width: picture.width,
                pixel_height: picture.height,
            });
        }
        if let Some(reader) = uia::Reader::new(f64::from(monitor.size().height)) {
            // Alt-click on selected text explains that text.
            payload.selection = reader.selection().filter(|selection| {
                let frame = selection.frame;
                f64::from(x) >= frame.x - 6.0
                    && f64::from(x) <= frame.x + frame.width + 6.0
                    && f64::from(y) >= frame.y - 6.0
                    && f64::from(y) <= frame.y + frame.height + 6.0
            });
            if payload.selection.is_none() {
                payload.found = reader.reading_at(at);
            }
            let pdf = target.as_ref().and_then(|window| {
                reader
                    .window_element(window.handle)
                    .and_then(|element| reader.address_bar_file(&element))
                    .and_then(|url| pdf_path::from_file_url(&url))
                    .or_else(|| pdf_path::from_title(&window.title))
            });
            payload.pdf_path = pdf.as_ref().map(|path| path.to_string_lossy().into_owned());
            keep(Kept { id, picture, pdf });
        } else {
            keep(Kept { id, picture, pdf: None });
        }
    }
    // A later click took over: its reading is the one that opens.
    if NEXT_ID.load(Ordering::SeqCst) != id {
        return;
    }
    if !shown.swap(true, Ordering::SeqCst) {
        overlay::show_on(app, &monitor);
    }
    let _ = app.emit_to(overlay::LABEL, "anywhere-read", payload);
}

fn overlay_handle(app: &AppHandle) -> isize {
    use tauri::Manager;
    app.get_webview_window(overlay::LABEL)
        .and_then(|window| window.hwnd().ok())
        .map_or(0, |handle| handle.0 as isize)
}

fn keep(kept: Kept) {
    if let Ok(mut all) = KEPT.lock() {
        all.push_back(kept);
        while all.len() > 3 {
            all.pop_front();
        }
    }
}

/// The pixels of click `id`'s window picture, BGRA.
pub fn picture(id: u64) -> Option<Vec<u8>> {
    let all = KEPT.lock().ok()?;
    all.iter()
        .find(|kept| kept.id == id)?
        .picture
        .as_ref()
        .map(|picture| picture.bgra.clone())
}

/// The bytes of the PDF found behind click `id`'s window. Only that file: the interface can't name another.
pub fn pdf(id: u64) -> Option<Vec<u8>> {
    let path = {
        let all = KEPT.lock().ok()?;
        all.iter().find(|kept| kept.id == id)?.pdf.clone()?
    };
    std::fs::read(path).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exam_browsers_and_password_managers_are_never_read() {
        assert!(is_protected("SafeExamBrowser.exe"));
        assert!(is_protected("KeePassXC.exe"));
        assert!(!is_protected("msedge.exe"));
    }
}
