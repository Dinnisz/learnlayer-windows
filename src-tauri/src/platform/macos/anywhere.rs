//! ⌥-click in any app on the Mac: the Mac side of `platform/windows/anywhere/mod.rs`, on the Swift app's own code
//! (LearnLayer/Anywhere/ClickMonitor.swift, AccessibilityReader.swift and `ScreenGrab` @ e0af40f, in
//! `macos-native/`). The event tap sees the click; a worker thread reads what is there — a picture of the window
//! and its Vision lines, what Accessibility exposes under the point, the PDF the window shows — and hands it all to
//! the stage window, whose TypeScript decides which question it is and opens it. The events and their payloads are
//! the Windows ones, so the interface is the same on both systems.
//!
//! Nothing is shown before the click, nothing is read from password fields, exam browsers or password managers, and
//! only the clicked question's region ever goes to the model.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Monitor};

use super::native::{self, Line, Picture, TapEvent};
use super::overlay;

/// Exam browsers and password managers, by bundle identifier: nothing is read in them (CLAUDE.md §2.12).
const PROTECTED: &[&str] = &[
    "org.safeexambrowser.",
    "com.respondus.lockdownbrowser",
    "com.agilebits.onepassword",
    "com.1password.",
    "com.bitwarden.",
    "org.keepassxc.",
    "com.apple.passwords",
    "com.apple.keychainaccess",
];

/// Whether nothing may be read in the app with this bundle identifier.
pub fn is_protected(bundle_id: &str) -> bool {
    let bundle = bundle_id.to_ascii_lowercase();
    PROTECTED
        .iter()
        .any(|prefix| bundle == prefix.trim_end_matches('.') || bundle.starts_with(prefix))
}

struct Kept {
    id: u64,
    picture: Option<Picture>,
    pdf: Option<PathBuf>,
}

static KEPT: Mutex<VecDeque<Kept>> = Mutex::new(VecDeque::new());
static NEXT_ID: AtomicU64 = AtomicU64::new(0);
static ENABLED: AtomicBool = AtomicBool::new(true);
static TALK_ENABLED: AtomicBool = AtomicBool::new(true);
/// Where the tap's events go (set once, when ⌥-click starts).
static EVENTS: OnceLock<Mutex<mpsc::Sender<TapEvent>>> = OnceLock::new();

/// Called by Swift on the tap thread: only queues the event, so the tap answers at once.
extern "C" fn on_tap_event(kind: i32, x: f64, y: f64) {
    let Some(event) = TapEvent::from_raw(kind, x, y) else {
        return;
    };
    if let Some(sender) = EVENTS.get().and_then(|sender| sender.lock().ok()) {
        let _ = sender.send(event);
    }
}

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
    refused: Option<&'static str>,
    found: Option<serde_json::Value>,
    selection: Option<serde_json::Value>,
    window: Option<WindowPayload>,
    lines: Vec<Line>,
    pdf_path: Option<String>,
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

/// The stage's part of the screen (below the menu bar), which the interface calls the monitor: every point it gets
/// is placed from this rectangle's top-left.
fn monitor_rect(monitor: &Monitor) -> PixelRect {
    let (x, y, width, height) = overlay::stage_area(monitor);
    PixelRect { x, y, width, height }
}

/// The screen holding a point in global points (top-left origin). Tauri gives each screen's frame in pixels: its
/// points are those over its scale.
fn monitor_at(app: &AppHandle, x: f64, y: f64) -> Option<Monitor> {
    let monitors = app.available_monitors().ok()?;
    let contains = |monitor: &Monitor| {
        let scale = monitor.scale_factor();
        let left = f64::from(monitor.position().x) / scale;
        let top = f64::from(monitor.position().y) / scale;
        let width = f64::from(monitor.size().width) / scale;
        let height = f64::from(monitor.size().height) / scale;
        x >= left && x < left + width && y >= top && y < top + height
    };
    monitors
        .iter()
        .find(|monitor| contains(monitor))
        .cloned()
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// Starts listening for ⌥-click: the stage window, the tap, and the thread that answers it. Without the
/// Accessibility permission the system's prompt shows once, and the tap starts by itself as soon as it is granted.
pub fn start(app: &AppHandle, enabled: bool) -> Result<(), String> {
    overlay::create(app).map_err(|error| error.to_string())?;
    ENABLED.store(enabled, Ordering::SeqCst);
    let (sender, receiver) = mpsc::channel();
    EVENTS
        .set(Mutex::new(sender))
        .map_err(|_| "⌥-click was already started".to_string())?;
    {
        let app = app.clone();
        std::thread::Builder::new()
            .name("learnlayer-anywhere".into())
            .spawn(move || {
                for event in receiver {
                    handle(&app, event);
                }
            })
            .map_err(|error| error.to_string())?;
    }
    if enabled {
        install_when_trusted(app);
    }
    Ok(())
}

/// Installs the tap now if Accessibility is granted; else asks once and waits for it, checking every second.
fn install_when_trusted(app: &AppHandle) {
    if native::tap_running() {
        native::tap_set_enabled(true);
        return;
    }
    if try_install() {
        eprintln!("⌥-click: the tap is running");
        return;
    }
    eprintln!(
        "⌥-click: waiting for the Accessibility permission (System Settings › Privacy & Security › Accessibility)"
    );
    // The system's prompt leads to System Settings › Privacy & Security › Accessibility.
    native::accessibility_trusted(true);
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("learnlayer-anywhere-trust".into())
        .spawn(move || {
            for _ in 0..600 {
                std::thread::sleep(Duration::from_secs(1));
                if !ENABLED.load(Ordering::SeqCst) || native::tap_running() {
                    return;
                }
                if native::accessibility_trusted(false) && try_install() {
                    eprintln!("⌥-click: the tap is running");
                    let _ = app.emit("anywhere-ready", ());
                    return;
                }
            }
        });
}

fn try_install() -> bool {
    match native::tap_start(on_tap_event) {
        native::TapStart::Running => {
            native::tap_set_enabled(ENABLED.load(Ordering::SeqCst));
            native::tap_set_talk_enabled(TALK_ENABLED.load(Ordering::SeqCst));
            native::enable_running_browsers();
            // A window's picture needs Screen Recording: the system's prompt shows once, the first time.
            native::screen_capture_allowed(true);
            true
        }
        native::TapStart::NotTrusted | native::TapStart::Refused => false,
    }
}

fn handle(app: &AppHandle, event: TapEvent) {
    match event {
        TapEvent::OptionClick { x, y } => {
            let app = app.clone();
            std::thread::spawn(move || read_click(&app, x, y));
        }
        TapEvent::Escape => {
            let _ = app.emit_to(overlay::LABEL, "anywhere-escape", ());
        }
        TapEvent::TalkBegan => {
            log_talk_key(&crate::config::data_dir(), true);
            let _ = app.emit("talk", true);
        }
        TapEvent::TalkEnded => {
            log_talk_key(&crate::config::data_dir(), false);
            let _ = app.emit("talk", false);
        }
        TapEvent::Removed => {
            // The pill offers to turn it back on (`onFailSafe` in the Swift app).
            let _ = app.emit("anywhere-hook-removed", ());
        }
    }
}

/// The Settings switch. Off: every click passes through untouched (the tap stays, doing nothing).
pub fn set_enabled(app: &AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
    native::tap_set_enabled(enabled);
    if enabled && EVENTS.get().is_some() {
        install_when_trusted(app);
    }
}

/// The talk key: Control + Option held, as in the Swift app, whatever key Windows' setting names; "none" turns it off.
pub fn set_talk_key(key: &str) {
    let enabled = key != "none";
    TALK_ENABLED.store(enabled, Ordering::SeqCst);
    native::tap_set_talk_enabled(enabled);
}

/// The talk key's presses as the tap saw them, in `talk-keys.jsonl`: the time and whether it is held, nothing else.
fn log_talk_key(folder: &std::path::Path, held: bool) {
    const KEEP: usize = 200;
    let path = folder.join("talk-keys.jsonl");
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_millis())
        .unwrap_or_default();
    let before = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<&str> = before.lines().filter(|line| !line.trim().is_empty()).collect();
    let line = format!("{{\"at\":{at},\"held\":{held}}}");
    lines.push(&line);
    let from = lines.len().saturating_sub(KEEP);
    let _ = std::fs::create_dir_all(folder);
    let _ = std::fs::write(&path, lines[from..].join("\n") + "\n");
}

/// Whether a click at (`x`, `y`) pixels falls on a selection's frame (in pixels), with a little room.
fn on_selection(selection: &serde_json::Value, x: f64, y: f64) -> bool {
    let frame = &selection["frame"];
    let (Some(left), Some(top), Some(width), Some(height)) = (
        frame["x"].as_f64(),
        frame["y"].as_f64(),
        frame["width"].as_f64(),
        frame["height"].as_f64(),
    ) else {
        return false;
    };
    x >= left - 6.0 && x <= left + width + 6.0 && y >= top - 6.0 && y <= top + height + 6.0
}

/// One click (global points): read everything that can be read there, keep the pixels and the PDF for the
/// interface, and hand over.
fn read_click(app: &AppHandle, x: f64, y: f64) {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let Some(monitor) = monitor_at(app, x, y) else {
        return;
    };
    let scale = monitor.scale_factor();
    let point = PixelPoint {
        x: x * scale,
        y: y * scale,
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
    let target = native::window_at(x, y);
    let mut payload = ReadPayload {
        id,
        point,
        monitor: monitor_rect(&monitor),
        scale,
        app_name: target
            .as_ref()
            .map(|window| window.app_name.clone())
            .unwrap_or_default(),
        refused: None,
        found: None,
        selection: None,
        window: None,
        lines: Vec::new(),
        pdf_path: None,
        notice: None,
    };
    // «Reading…» if it takes a while: the stage shows, letting clicks through, while Accessibility answers.
    let shown = Arc::new(AtomicBool::new(false));
    {
        let (app, monitor, shown) = (app.clone(), monitor.clone(), shown.clone());
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(350));
            if NEXT_ID.load(Ordering::SeqCst) == id && !shown.swap(true, Ordering::SeqCst) {
                overlay::show_on(&app, &monitor);
            }
        });
    }
    if let Some(window) = target.as_ref().filter(|window| is_protected(&window.bundle_id)) {
        payload.refused = Some("protected");
        payload.app_name = window.app_name.clone();
    } else {
        // The picture first: the window's own pixels, so the stage is never in it.
        let picture = target.as_ref().and_then(|window| native::window_picture(window.number));
        if let (Some(window), Some(picture)) = (target.as_ref(), picture.as_ref()) {
            payload.lines = native::ocr_lines(picture);
            payload.window = Some(WindowPayload {
                x: window.x * scale,
                y: window.y * scale,
                width: window.width * scale,
                height: window.height * scale,
                pixel_width: picture.width,
                pixel_height: picture.height,
            });
        }
        // ⌥-click on selected text explains that text.
        payload.selection = native::selection(scale).filter(|selection| on_selection(selection, point.x, point.y));
        if payload.selection.is_none() {
            payload.found = native::read_at(x, y, scale);
        }
        let pdf = target
            .as_ref()
            .and_then(|window| native::pdf_path(window.pid, x, y))
            .map(PathBuf::from);
        payload.pdf_path = pdf.as_ref().map(|path| path.to_string_lossy().into_owned());
        keep(Kept { id, picture, pdf });
    }
    // Only counts and the app's name, never the text (`AnywhereLog` in the Swift app).
    eprintln!(
        "⌥-click in {}: picture {}, {} OCR lines, accessibility {}, selection {}, PDF {}{}",
        payload.app_name,
        payload.window.is_some(),
        payload.lines.len(),
        payload.found.is_some(),
        payload.selection.is_some(),
        payload.pdf_path.is_some(),
        if payload.refused.is_some() {
            " (protected: nothing read)"
        } else {
            ""
        },
    );
    // A later click took over: its reading is the one that opens.
    if NEXT_ID.load(Ordering::SeqCst) != id {
        return;
    }
    if !shown.swap(true, Ordering::SeqCst) {
        overlay::show_on(app, &monitor);
    }
    let _ = app.emit_to(overlay::LABEL, "anywhere-read", payload);
}

/// "Explain selected text" from the pill: the text selected in the app in front, opened like an ⌥-click on it
/// (`AnywhereController.explainSelection`).
pub fn explain_selection(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || read_selection(&app));
}

fn read_selection(app: &AppHandle) {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let Some(monitor) = cursor_monitor(app) else {
        return;
    };
    let scale = monitor.scale_factor();
    let front = native::front_app();
    let refused = front.as_ref().is_some_and(|front| is_protected(&front.bundle_id));
    let selection = if refused { None } else { native::selection(scale) };
    let centre = selection
        .as_ref()
        .and_then(|selection| {
            let frame = &selection["frame"];
            Some(PixelPoint {
                x: frame["x"].as_f64()? + frame["width"].as_f64()? / 2.0,
                y: frame["y"].as_f64()? + frame["height"].as_f64()? / 2.0,
            })
        })
        .unwrap_or_else(|| {
            let rect = monitor_rect(&monitor);
            PixelPoint {
                x: rect.x + rect.width / 2.0,
                y: rect.y + rect.height / 2.0,
            }
        });
    let notice = if refused || selection.is_some() {
        None
    } else {
        Some("Select some text first.")
    };
    let payload = ReadPayload {
        id,
        point: centre,
        monitor: monitor_rect(&monitor),
        scale,
        app_name: front.map(|front| front.app_name).unwrap_or_default(),
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

/// The screen under the pointer.
fn cursor_monitor(app: &AppHandle) -> Option<Monitor> {
    let position = app.cursor_position().ok()?;
    app.monitor_from_point(position.x, position.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// "Capture an area" from the pill: the screen under the pointer, frozen in a picture the stage shows; the student
/// drags a rectangle on it (`screencapture -i` in the Swift app). Esc cancels.
pub fn capture_area(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let Some(monitor) = cursor_monitor(&app) else {
            return;
        };
        overlay::hide_for_reading(&app);
        // The pill closes first, so the picture is of what the student sees.
        std::thread::sleep(Duration::from_millis(150));
        let scale = monitor.scale_factor();
        let rect = monitor_rect(&monitor);
        let Some(picture) =
            native::screen_picture(rect.x / scale, rect.y / scale, rect.width / scale, rect.height / scale)
        else {
            return;
        };
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst) + 1;
        let payload = CapturePayload {
            id,
            monitor: rect,
            scale,
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

/// The part of `picture` at (`x`, `y`) of `width` × `height` pixels, clamped to the picture; None when empty.
fn crop(picture: &Picture, x: i32, y: i32, width: i32, height: i32) -> Option<Picture> {
    let left = x.clamp(0, picture.width);
    let top = y.clamp(0, picture.height);
    let right = x.saturating_add(width).clamp(left, picture.width);
    let bottom = y.saturating_add(height).clamp(top, picture.height);
    if right - left < 2 || bottom - top < 2 {
        return None;
    }
    let row = (picture.width * 4) as usize;
    let mut bgra = Vec::with_capacity(((right - left) * (bottom - top) * 4) as usize);
    for line in top..bottom {
        let start = line as usize * row + left as usize * 4;
        bgra.extend_from_slice(&picture.bgra[start..start + (right - left) as usize * 4]);
    }
    Some(Picture {
        width: right - left,
        height: bottom - top,
        bgra,
    })
}

/// The Vision lines of the dragged part of capture `id` (pixels of its picture), in pixels from that part's top-left.
pub fn capture_text(id: u64, x: i32, y: i32, width: i32, height: i32) -> Vec<Line> {
    let part = {
        let Ok(all) = KEPT.lock() else {
            return Vec::new();
        };
        all.iter()
            .find(|kept| kept.id == id)
            .and_then(|kept| kept.picture.as_ref())
            .and_then(|picture| crop(picture, x, y, width, height))
    };
    part.map(|part| native::ocr_lines(&part)).unwrap_or_default()
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
        assert!(is_protected("org.safeexambrowser.SafeExamBrowser"));
        assert!(is_protected("com.1password.1password"));
        assert!(is_protected("com.apple.Passwords"));
        assert!(!is_protected("com.apple.Preview"));
        assert!(!is_protected("com.apple.Safari"));
    }

    #[test]
    fn a_crop_is_clamped_to_the_picture() {
        let picture = Picture {
            width: 4,
            height: 3,
            bgra: (0..48).collect(),
        };
        let part = crop(&picture, 2, 1, 10, 10).expect("part");
        assert_eq!((part.width, part.height), (2, 2));
        assert_eq!(&part.bgra[..8], &[24, 25, 26, 27, 28, 29, 30, 31]);
        assert!(crop(&picture, 4, 0, 2, 2).is_none());
    }

    #[test]
    fn a_click_on_the_selection_opens_it() {
        let selection =
            serde_json::json!({"text": "x", "frame": {"x": 100.0, "y": 50.0, "width": 40.0, "height": 20.0}});
        assert!(on_selection(&selection, 120.0, 60.0));
        assert!(on_selection(&selection, 95.0, 46.0));
        assert!(!on_selection(&selection, 200.0, 60.0));
    }
}
