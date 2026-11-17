//! The selected text by copying it, when UI Automation doesn't give it (Chromium's PDF viewer, in Edge, Chrome and
//! Brave, has a selection but no text pattern for it). Ctrl+C goes to the app in front, the clipboard's text is read,
//! and the clipboard is put back as it was: its text, or empty. Only when the student asked ("Explain selected text"),
//! and never in the apps nothing is read in.

use std::time::{Duration, Instant};

use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, CountClipboardFormats, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
    IsClipboardFormatAvailable, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP, VK_C, VK_CONTROL};

const TEXT: u32 = CF_UNICODETEXT.0 as u32;

/// The text Ctrl+C copies from the app in front, or None when it copies nothing (no selection) or the clipboard
/// holds something other than text, which could not be put back.
pub fn copied_selection() -> Option<String> {
    // SAFETY: clipboard reads and writes with the clipboard open, and key events to whatever has the keyboard.
    unsafe {
        // A picture or files on the clipboard: copying over them would lose them. Not done.
        let formats = CountClipboardFormats();
        let has_text = IsClipboardFormatAvailable(TEXT).is_ok();
        if formats > 0 && !has_text {
            return None;
        }
        let previous = if has_text { read_text() } else { None };
        let before = GetClipboardSequenceNumber();
        press_copy();
        let start = Instant::now();
        while GetClipboardSequenceNumber() == before && start.elapsed() < Duration::from_millis(600) {
            std::thread::sleep(Duration::from_millis(20));
        }
        if GetClipboardSequenceNumber() == before {
            return None;
        }
        // The app may still be writing its other formats.
        std::thread::sleep(Duration::from_millis(40));
        let copied = read_text();
        restore(previous.as_deref());
        copied
            .map(|text| text.trim().to_string())
            .filter(|text| text.chars().count() >= 2)
    }
}

/// Ctrl+C, after letting go of any modifier the student may still hold.
unsafe fn press_copy() {
    keybd_event(VK_CONTROL.0 as u8, 0, Default::default(), 0);
    keybd_event(VK_C.0 as u8, 0, Default::default(), 0);
    keybd_event(VK_C.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
}

/// Opens the clipboard, retrying while another app has it open.
unsafe fn open() -> bool {
    for _ in 0..10 {
        if OpenClipboard(None).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    false
}

unsafe fn read_text() -> Option<String> {
    if !open() {
        return None;
    }
    let text = GetClipboardData(TEXT).ok().and_then(|handle| {
        let memory = HGLOBAL(handle.0);
        let pointer = GlobalLock(memory) as *const u16;
        if pointer.is_null() {
            return None;
        }
        let mut length = 0usize;
        while *pointer.add(length) != 0 && length < 1_000_000 {
            length += 1;
        }
        let text = String::from_utf16_lossy(std::slice::from_raw_parts(pointer, length));
        let _ = GlobalUnlock(memory);
        Some(text)
    });
    let _ = CloseClipboard();
    text
}

/// The clipboard as it was: `previous` text, or nothing.
unsafe fn restore(previous: Option<&str>) {
    if !open() {
        return;
    }
    let _ = EmptyClipboard();
    if let Some(text) = previous {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        if let Ok(memory) = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2) {
            let pointer = GlobalLock(memory) as *mut u16;
            if !pointer.is_null() {
                std::ptr::copy_nonoverlapping(wide.as_ptr(), pointer, wide.len());
                let _ = GlobalUnlock(memory);
                // The clipboard owns the memory from here.
                let _ = SetClipboardData(TEXT, Some(HANDLE(memory.0)));
            }
        }
    }
    let _ = CloseClipboard();
}
