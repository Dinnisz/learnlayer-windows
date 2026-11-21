//! The C boundary to the Swift package in `src-tauri/macos-native/` (built and linked by build.rs through swift-rs).
//! Every function here is a thin, safe wrapper: text comes back as a JSON string Swift made with `strdup`, pictures
//! as `malloc`ed BGRA bytes, and both are copied and given back to `ll_free` at once.

use std::ffi::{c_char, c_void, CStr};

use serde::de::DeserializeOwned;

/// What the event tap reports (`TapEvent` in ClickMonitor.swift).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TapEvent {
    OptionClick { x: f64, y: f64 },
    Escape,
    TalkBegan,
    TalkEnded,
    Removed,
}

impl TapEvent {
    pub fn from_raw(kind: i32, x: f64, y: f64) -> Option<TapEvent> {
        match kind {
            1 => Some(TapEvent::OptionClick { x, y }),
            2 => Some(TapEvent::Escape),
            3 => Some(TapEvent::TalkBegan),
            4 => Some(TapEvent::TalkEnded),
            5 => Some(TapEvent::Removed),
            _ => None,
        }
    }
}

pub type TapCallback = extern "C" fn(kind: i32, x: f64, y: f64);

/// Why the tap did not start.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TapStart {
    Running,
    NotTrusted,
    Refused,
}

extern "C" {
    fn ll_free(pointer: *mut c_void);
    fn ll_accessibility_trusted(prompt: bool) -> bool;
    fn ll_screen_capture_allowed(request: bool) -> bool;
    fn ll_window_number(window: *mut c_void) -> isize;
    fn ll_configure_overlay(window: *mut c_void);
    fn ll_activate_pid(pid: i32);
    fn ll_tap_start(callback: TapCallback) -> i32;
    fn ll_tap_running() -> bool;
    fn ll_tap_set_enabled(enabled: bool);
    fn ll_tap_set_intercepts_escape(intercepts: bool);
    fn ll_tap_set_talk_enabled(enabled: bool);
    fn ll_tap_set_see_through(number: isize);
    fn ll_read_at(x: f64, y: f64, scale: f64) -> *mut c_char;
    fn ll_selection(scale: f64) -> *mut c_char;
    fn ll_pdf_path(pid: i32, x: f64, y: f64) -> *mut c_char;
    fn ll_enable_running_browsers();
    fn ll_window_at(x: f64, y: f64) -> *mut c_char;
    fn ll_front_app() -> *mut c_char;
    fn ll_window_picture(number: isize, width: *mut isize, height: *mut isize) -> *mut u8;
    fn ll_screen_picture(x: f64, y: f64, w: f64, h: f64, width: *mut isize, height: *mut isize) -> *mut u8;
    fn ll_ocr_lines(bgra: *const u8, width: isize, height: isize) -> *mut c_char;
}

/// Takes a string Swift made (or null) and frees it.
fn take_string(pointer: *mut c_char) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    // SAFETY: a NUL-terminated string from `strdup` in Swift, read once and then freed.
    let text = unsafe { CStr::from_ptr(pointer) }.to_string_lossy().into_owned();
    // SAFETY: made with `strdup`, freed exactly once.
    unsafe { ll_free(pointer.cast()) };
    Some(text)
}

fn take_json<T: DeserializeOwned>(pointer: *mut c_char) -> Option<T> {
    take_string(pointer).and_then(|text| serde_json::from_str(&text).ok())
}

/// BGRA pixels, 4 bytes a pixel, rows top to bottom.
#[derive(Debug, Clone)]
pub struct Picture {
    pub width: i32,
    pub height: i32,
    pub bgra: Vec<u8>,
}

fn take_picture(pointer: *mut u8, width: isize, height: isize) -> Option<Picture> {
    if pointer.is_null() {
        return None;
    }
    let length = (width.max(0) as usize) * (height.max(0) as usize) * 4;
    // SAFETY: Swift filled `length` bytes at `pointer` with `malloc`; copied here, then freed once.
    let bgra = unsafe { std::slice::from_raw_parts(pointer, length) }.to_vec();
    // SAFETY: made with `malloc` in Swift, freed exactly once.
    unsafe { ll_free(pointer.cast()) };
    Some(Picture {
        width: i32::try_from(width).ok()?,
        height: i32::try_from(height).ok()?,
        bgra,
    })
}

pub fn accessibility_trusted(prompt: bool) -> bool {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_accessibility_trusted(prompt) }
}

pub fn screen_capture_allowed(request: bool) -> bool {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_screen_capture_allowed(request) }
}

/// The window server's number of one of this app's windows; 0 when it has none yet.
pub fn window_number(ns_window: *mut c_void) -> isize {
    // SAFETY: an `NSWindow*` Tauri gave for a live window of this app (or null, which Swift answers with 0).
    unsafe { ll_window_number(ns_window) }
}

pub fn configure_overlay(ns_window: *mut c_void) {
    // SAFETY: an `NSWindow*` Tauri gave for a live window of this app; Swift changes it on the main thread.
    unsafe { ll_configure_overlay(ns_window) }
}

/// Gives the keyboard back to the app `pid` (the one the stage was opened over).
pub fn activate(pid: i32) {
    // SAFETY: a plain call into the Swift package; a pid that is gone does nothing.
    unsafe { ll_activate_pid(pid) }
}

pub fn tap_start(callback: TapCallback) -> TapStart {
    // SAFETY: `callback` is a plain `extern "C"` function that lives for the whole program.
    match unsafe { ll_tap_start(callback) } {
        0 => TapStart::Running,
        1 => TapStart::NotTrusted,
        _ => TapStart::Refused,
    }
}

pub fn tap_running() -> bool {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_tap_running() }
}

pub fn tap_set_enabled(enabled: bool) {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_tap_set_enabled(enabled) }
}

pub fn tap_set_intercepts_escape(intercepts: bool) {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_tap_set_intercepts_escape(intercepts) }
}

pub fn tap_set_talk_enabled(enabled: bool) {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_tap_set_talk_enabled(enabled) }
}

/// The window (by number) a click goes through, 0 for none.
pub fn tap_set_see_through(number: isize) {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_tap_set_see_through(number) }
}

/// What Accessibility exposes at a point (global points), frames in pixels at `scale`; the shape of Windows'
/// `uia::Reading`.
pub fn read_at(x: f64, y: f64, scale: f64) -> Option<serde_json::Value> {
    // SAFETY: a call into the Swift package; the string it returns is taken and freed.
    take_json(unsafe { ll_read_at(x, y, scale) })
}

/// The text selected in the app in front, `{text, frame}` with its frame in pixels at `scale`.
pub fn selection(scale: f64) -> Option<serde_json::Value> {
    // SAFETY: a call into the Swift package; the string it returns is taken and freed.
    take_json(unsafe { ll_selection(scale) })
}

/// The PDF a window of app `pid` shows (the one under the point, else its focused one).
pub fn pdf_path(pid: i32, x: f64, y: f64) -> Option<String> {
    // SAFETY: a call into the Swift package; the string it returns is taken and freed.
    take_string(unsafe { ll_pdf_path(pid, x, y) })
}

pub fn enable_running_browsers() {
    // SAFETY: a plain call into the Swift package.
    unsafe { ll_enable_running_browsers() }
}

/// The ordinary window under a point (global points) that isn't LearnLayer's.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetWindow {
    pub number: isize,
    pub pid: i32,
    pub app_name: String,
    pub bundle_id: String,
    #[allow(dead_code)]
    pub title: String,
    /// Points, global, top-left origin.
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn window_at(x: f64, y: f64) -> Option<TargetWindow> {
    // SAFETY: a call into the Swift package; the string it returns is taken and freed.
    take_json(unsafe { ll_window_at(x, y) })
}

/// The app in front: its name, bundle identifier and pid.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontApp {
    pub app_name: String,
    pub bundle_id: String,
    pub pid: i32,
}

pub fn front_app() -> Option<FrontApp> {
    // SAFETY: a call into the Swift package; the string it returns is taken and freed.
    take_json(unsafe { ll_front_app() })
}

/// A picture of window `number`; None without Screen Recording.
pub fn window_picture(number: isize) -> Option<Picture> {
    let (mut width, mut height) = (0isize, 0isize);
    // SAFETY: the out-pointers are live locals; the bytes returned are taken and freed.
    let pointer = unsafe { ll_window_picture(number, &mut width, &mut height) };
    take_picture(pointer, width, height)
}

/// A picture of a part of the screen (global points).
pub fn screen_picture(x: f64, y: f64, width: f64, height: f64) -> Option<Picture> {
    let (mut pixel_width, mut pixel_height) = (0isize, 0isize);
    // SAFETY: the out-pointers are live locals; the bytes returned are taken and freed.
    let pointer = unsafe { ll_screen_picture(x, y, width, height, &mut pixel_width, &mut pixel_height) };
    take_picture(pointer, pixel_width, pixel_height)
}

/// One line of text Vision read, in pixels from the picture's top-left.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Line {
    pub text: String,
    pub rect: LineRect,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LineRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// The text lines Vision reads in `picture` (accurate, Portuguese of Portugal first).
pub fn ocr_lines(picture: &Picture) -> Vec<Line> {
    if picture.bgra.len() < (picture.width.max(0) as usize) * (picture.height.max(0) as usize) * 4 {
        return Vec::new();
    }
    // SAFETY: `bgra` holds width × height × 4 bytes and outlives the call; the string returned is taken and freed.
    let text = unsafe { ll_ocr_lines(picture.bgra.as_ptr(), picture.width as isize, picture.height as isize) };
    take_json(text).unwrap_or_default()
}
