//! Alt-click in any app (CLAUDE.md §3.1): the Windows side of LearnLayer/Anywhere/AnywhereController.swift
//! @ ref 2026-11-04. The hooks see the click (`hook`); a worker thread reads what is there — a picture of the window
//! and its OCR lines (`capture`, `ocr`), UI Automation's text (`uia`), the PDF the window shows (`pdf_path`) — and hands
//! it all to the stage window (`overlay`), whose TypeScript decides which question it is and opens it. Nothing is
//! shown before the click, nothing is read from password fields or exam browsers, and only the clicked question's
//! region ever goes to the model.

pub mod capture;
pub mod copy;
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
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindow, GetWindowRect, GetWindowTextLengthW, GetWindowThreadProcessId,
    IsWindowVisible, SetForegroundWindow, GW_HWNDNEXT,
};

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
    /// A word for the stage to show instead of a question (a locale key): "Select some text first.".
    notice: Option<&'static str>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CapturePayload {
    id: u64,
    monitor: PixelRect,
    scale: f64,
    pixel_width: i32,
    pixel_height: i32,
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
        notice: None,
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

/// "Explain selected text" from the pill: the text selected in the app in front, opened like an Alt-click on it
/// (`AnywhereController.explainSelection` on the Mac). The pill never takes the keyboard, so the app in front is still
/// the student's.
pub fn explain_selection(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || read_selection(&app));
}

/// The window the student was working in. A click on the pill can give the pill the keyboard; then it is the first
/// visible, titled window below LearnLayer's own, which gets the keyboard back so its selection can be read.
fn student_window() -> HWND {
    // SAFETY: plain window queries; a window that closes meanwhile only makes them fail.
    unsafe {
        let own = GetCurrentProcessId();
        let owner = |window: HWND| {
            let mut process = 0u32;
            GetWindowThreadProcessId(window, Some(&mut process as *mut u32));
            process
        };
        let front = GetForegroundWindow();
        if owner(front) != own {
            return front;
        }
        let mut window = front;
        for _ in 0..200 {
            let Ok(next) = GetWindow(window, GW_HWNDNEXT) else {
                break;
            };
            if next.is_invalid() {
                break;
            }
            window = next;
            if IsWindowVisible(window).as_bool() && GetWindowTextLengthW(window) > 0 && owner(window) != own {
                let _ = SetForegroundWindow(window);
                std::thread::sleep(Duration::from_millis(120));
                return window;
            }
        }
        front
    }
}

fn read_selection(app: &AppHandle) {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let student = student_window();
    let mut cursor = POINT::default();
    // SAFETY: reads the pointer's position and the window in front; both only fail harmlessly.
    let (front_app, cursor) = unsafe {
        let _ = GetCursorPos(&mut cursor);
        let mut process_id = 0u32;
        GetWindowThreadProcessId(student, Some(&mut process_id as *mut u32));
        (capture::executable_name(process_id).unwrap_or_default(), cursor)
    };
    let Ok(Some(pointer_monitor)) = app.monitor_from_point(f64::from(cursor.x), f64::from(cursor.y)) else {
        return;
    };
    let mut selection = None;
    let refused = is_protected(&front_app);
    if !refused {
        if let Some(reader) = uia::Reader::new(f64::from(pointer_monitor.size().height)) {
            selection = reader.selection();
        }
        // No text pattern for it (Chromium's PDF viewer): the selection by copying it, placed on the window in front.
        if selection.is_none() {
            selection = copy::copied_selection().map(|text| {
                let mut window = RECT::default();
                // SAFETY: reads the rectangle of the window in front.
                let _ = unsafe { GetWindowRect(student, &mut window) };
                uia::Selection {
                    text,
                    frame: uia::Frame::from(window),
                }
            });
        }
    }
    // The stage opens where the selection is (its monitor), else under the pointer.
    let centre = selection.as_ref().map_or(
        PixelPoint {
            x: f64::from(cursor.x),
            y: f64::from(cursor.y),
        },
        |selection: &uia::Selection| PixelPoint {
            x: selection.frame.x + selection.frame.width / 2.0,
            y: selection.frame.y + selection.frame.height / 2.0,
        },
    );
    let monitor = app
        .monitor_from_point(centre.x, centre.y)
        .ok()
        .flatten()
        .unwrap_or(pointer_monitor);
    let notice = if refused || selection.is_some() {
        None
    } else {
        Some("Select some text first.")
    };
    let payload = ReadPayload {
        id,
        point: centre,
        monitor: monitor_rect(&monitor),
        scale: monitor.scale_factor(),
        app_name: front_app,
        refused: refused.then_some("protected"),
        found: None,
        selection,
        window: None,
        lines: Vec::new(),
        pdf_path: None,
        notice,
    };
    overlay::show_on(app, &monitor);
    let _ = app.emit_to(overlay::LABEL, "anywhere-read", payload);
}

/// "Capture an area" from the pill: the monitor under the pointer, frozen in a picture the stage shows; the student
/// drags a rectangle on it (`screencapture -i` on the Mac). Esc cancels.
pub fn capture_area(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut cursor = POINT::default();
        // SAFETY: reads the pointer's position.
        unsafe {
            let _ = GetCursorPos(&mut cursor);
        }
        let Ok(Some(monitor)) = app.monitor_from_point(f64::from(cursor.x), f64::from(cursor.y)) else {
            return;
        };
        overlay::hide_for_reading(&app);
        // The pill closes first, so the picture is of what the student sees.
        std::thread::sleep(Duration::from_millis(150));
        let area = RECT {
            left: monitor.position().x,
            top: monitor.position().y,
            right: monitor.position().x + monitor.size().width as i32,
            bottom: monitor.position().y + monitor.size().height as i32,
        };
        let Some(picture) = capture::screen_area(area) else {
            return;
        };
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst) + 1;
        let payload = CapturePayload {
            id,
            monitor: monitor_rect(&monitor),
            scale: monitor.scale_factor(),
            pixel_width: picture.width,
            pixel_height: picture.height,
        };
        keep(Kept {
            id,
            picture: Some(picture),
            pdf: None,
        });
        overlay::show_on(&app, &monitor);
        overlay::set_interactive(&app, true);
        let _ = app.emit_to(overlay::LABEL, "anywhere-capture", payload);
    });
}

/// The OCR lines of the dragged part of capture `id` (pixels of its picture), in pixels from that part's top-left.
pub fn capture_text(id: u64, x: i32, y: i32, width: i32, height: i32) -> Vec<ocr::Line> {
    let part = {
        let Ok(all) = KEPT.lock() else {
            return Vec::new();
        };
        all.iter()
            .find(|kept| kept.id == id)
            .and_then(|kept| kept.picture.as_ref())
            .and_then(|picture| capture::crop(picture, x, y, width, height))
    };
    part.map(|part| ocr::lines(&part)).unwrap_or_default()
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
