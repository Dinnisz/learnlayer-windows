//! The window under a point and a picture of it: the Windows side of `ScreenGrab` (LearnLayer/Anywhere/
//! AnywhereController.swift @ ref 2026-11-04). The picture is read on this computer (its region, its OCR lines);
//! only the question's region ever goes to the model. `PrintWindow` draws the window itself, so the stage above it
//! (or anything else) is never in the picture; a window that draws nothing that way is taken from the screen.

use std::ffi::c_void;

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetWindowTextW, GetWindowThreadProcessId, WindowFromPoint, GA_ROOT,
};

/// `PW_RENDERFULLCONTENT`: windows drawn by the GPU (browsers, Office) are drawn too.
const RENDER_FULL_CONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

/// The top-level window under a point, and what is known of it.
#[derive(Debug, Clone)]
pub struct TargetWindow {
    pub handle: isize,
    /// Physical pixels, global: the window as drawn (no invisible resize border).
    pub frame: RECT,
    /// The executable's file name ("msedge.exe"), for the exclusions and the log.
    pub executable: String,
    pub title: String,
}

/// The window's pixels: 4 bytes a pixel, blue first, rows top to bottom.
pub struct Picture {
    pub width: i32,
    pub height: i32,
    pub bgra: Vec<u8>,
}

/// The top-level window under `point` that is not LearnLayer's own (`skip` is the stage's window).
pub fn window_at(point: POINT, skip: isize) -> Option<TargetWindow> {
    // SAFETY: queries on the window under the point; a window that closes meanwhile only makes them fail.
    unsafe {
        let hit = WindowFromPoint(point);
        if hit.is_invalid() {
            return None;
        }
        let root = GetAncestor(hit, GA_ROOT);
        if root.0 as isize == skip {
            return None;
        }
        let mut process_id = 0u32;
        GetWindowThreadProcessId(root, Some(&mut process_id as *mut u32));
        if process_id == GetCurrentProcessId() {
            return None;
        }
        let mut frame = RECT::default();
        DwmGetWindowAttribute(
            root,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut frame as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .ok()?;
        let mut title = [0u16; 512];
        let length = GetWindowTextW(root, &mut title).max(0) as usize;
        Some(TargetWindow {
            handle: root.0 as isize,
            frame,
            executable: executable_name(process_id).unwrap_or_default(),
            title: String::from_utf16_lossy(&title[..length]),
        })
    }
}

/// The file name of a process's executable ("AcroRd32.exe").
pub fn executable_name(process_id: u32) -> Option<String> {
    // SAFETY: a limited query handle, closed before returning.
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()?;
        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        let named = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut size);
        let _ = CloseHandle(process);
        named.ok()?;
        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        path.rsplit('\\').next().map(str::to_string)
    }
}

/// A picture of `window`, drawn by the window itself; from the screen when that comes out blank.
pub fn picture(window: &TargetWindow) -> Option<Picture> {
    let width = window.frame.right - window.frame.left;
    let height = window.frame.bottom - window.frame.top;
    if width <= 40 || height <= 40 || width > 16_384 || height > 16_384 {
        return None;
    }
    let printed = draw(width, height, |memory| {
        // SAFETY: the window draws itself into our memory DC.
        unsafe { PrintWindow(HWND(window.handle as *mut c_void), memory, RENDER_FULL_CONTENT).as_bool() }
    });
    if let Some(picture) = printed.filter(|picture| !is_blank(picture)) {
        return Some(picture);
    }
    draw(width, height, |memory| {
        // SAFETY: copies the screen's pixels under the window's frame; the screen DC is released at once.
        unsafe {
            let screen = GetDC(None);
            let copied = BitBlt(
                memory,
                0,
                0,
                width,
                height,
                Some(screen),
                window.frame.left,
                window.frame.top,
                SRCCOPY,
            )
            .is_ok();
            ReleaseDC(None, screen);
            copied
        }
    })
}

/// The screen's pixels inside `area` (physical pixels, global): "Capture an area" freezes a monitor with it.
pub fn screen_area(area: RECT) -> Option<Picture> {
    let width = area.right - area.left;
    let height = area.bottom - area.top;
    if width <= 0 || height <= 0 || width > 16_384 || height > 16_384 {
        return None;
    }
    draw(width, height, |memory| {
        // SAFETY: copies the screen's pixels; the screen DC is released at once.
        unsafe {
            let screen = GetDC(None);
            let copied = BitBlt(memory, 0, 0, width, height, Some(screen), area.left, area.top, SRCCOPY).is_ok();
            ReleaseDC(None, screen);
            copied
        }
    })
}

/// The part of `picture` at (`x`, `y`) of `width` × `height` pixels, clamped to the picture; None when empty.
pub fn crop(picture: &Picture, x: i32, y: i32, width: i32, height: i32) -> Option<Picture> {
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

/// A top-down 32-bit DIB of `width` × `height`, filled by `fill` through a memory DC, as bytes.
fn draw(width: i32, height: i32, fill: impl FnOnce(windows::Win32::Graphics::Gdi::HDC) -> bool) -> Option<Picture> {
    // SAFETY: every GDI object made here is selected out and deleted before returning; `bits` is read only while the
    // DIB section is alive.
    unsafe {
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        ReleaseDC(None, screen);
        if memory.is_invalid() {
            return None;
        }
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                // Negative: rows top to bottom.
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut c_void = std::ptr::null_mut();
        let Ok(bitmap) = CreateDIBSection(Some(memory), &info, DIB_RGB_COLORS, &mut bits, None, 0) else {
            let _ = DeleteDC(memory);
            return None;
        };
        let previous = SelectObject(memory, HGDIOBJ(bitmap.0));
        let drawn = fill(memory);
        let bytes = if drawn && !bits.is_null() {
            Some(std::slice::from_raw_parts(bits as *const u8, (width * height * 4) as usize).to_vec())
        } else {
            None
        };
        SelectObject(memory, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory);
        bytes.map(|bgra| Picture { width, height, bgra })
    }
}

/// All one colour (a window that doesn't draw itself for `PrintWindow` comes out black).
fn is_blank(picture: &Picture) -> bool {
    let pixels = picture.bgra.chunks_exact(4);
    let first = &picture.bgra[..4.min(picture.bgra.len())];
    pixels
        .step_by(97)
        .all(|pixel| pixel[..3] == first[..3.min(first.len())])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_picture_of_one_colour_is_blank_and_one_with_ink_is_not() {
        let mut picture = Picture {
            width: 100,
            height: 100,
            bgra: vec![0; 100 * 100 * 4],
        };
        assert!(is_blank(&picture));
        for byte in picture.bgra.iter_mut().skip(4 * 5000).take(4 * 300) {
            *byte = 255;
        }
        assert!(!is_blank(&picture));
    }

    #[test]
    fn a_crop_keeps_its_rows_and_stays_inside_the_picture() {
        let picture = Picture {
            width: 4,
            height: 3,
            bgra: (0..4 * 3 * 4).map(|byte| byte as u8).collect(),
        };
        let part = crop(&picture, 1, 1, 2, 2).expect("a 2 × 2 crop");
        assert_eq!((part.width, part.height), (2, 2));
        // Row 1 starts at byte 16; column 1 is 4 bytes in.
        assert_eq!(&part.bgra[..4], &[20, 21, 22, 23]);
        assert_eq!(&part.bgra[8..12], &[36, 37, 38, 39]);
        let clamped = crop(&picture, 3, 2, 10, 10);
        assert!(clamped.is_none(), "a 1 × 1 crop is too small");
        assert_eq!(crop(&picture, -5, -5, 100, 100).map(|whole| whole.bgra.len()), Some(48));
    }
}
