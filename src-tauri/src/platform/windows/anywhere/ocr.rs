//! The text lines of a window's picture, read on this computer with Windows.Media.Ocr: the counterpart of
//! `QuestionLocator.readLines` (Vision on the Mac). Portuguese (Portugal) first, then English, then the languages of
//! the student's profile; a picture larger than the engine takes is read at a smaller size.

use serde::Serialize;
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Security::Cryptography::CryptographicBuffer;

use super::capture::Picture;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PixelRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A line of text, in pixels from the picture's top-left.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Line {
    pub text: String,
    pub rect: PixelRect,
}

fn engine() -> Option<OcrEngine> {
    for tag in ["pt-PT", "pt", "en-US", "en"] {
        let Ok(language) = Language::CreateLanguage(&HSTRING::from(tag)) else {
            continue;
        };
        if OcrEngine::IsLanguageSupported(&language).unwrap_or(false) {
            if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&language) {
                return Some(engine);
            }
        }
    }
    OcrEngine::TryCreateFromUserProfileLanguages().ok()
}

/// The picture at most `limit` pixels on each side, every other pixel dropped as often as needed; and the factor
/// that brings the result back to the picture's pixels.
fn within(picture: &Picture, limit: i32) -> (i32, i32, Vec<u8>, f64) {
    let mut step = 1;
    while picture.width / step > limit || picture.height / step > limit {
        step += 1;
    }
    if step == 1 {
        return (picture.width, picture.height, picture.bgra.clone(), 1.0);
    }
    let width = picture.width / step;
    let height = picture.height / step;
    let mut bytes = Vec::with_capacity((width * height * 4) as usize);
    for row in 0..height {
        for column in 0..width {
            let at = (((row * step) * picture.width + column * step) * 4) as usize;
            bytes.extend_from_slice(&picture.bgra[at..at + 4]);
        }
    }
    (width, height, bytes, f64::from(step))
}

/// The lines the OCR reads on `picture`; empty when there is no OCR for any language here.
pub fn lines(picture: &Picture) -> Vec<Line> {
    read(picture).unwrap_or_default()
}

/// `lines`, with the question numbers set apart in a margin column read again (`QuestionRegion.withGutterLabels` @
/// 5701363): numbers far left of the text ("1." beside "Um corpo de massa…") are often dropped by the page-wide
/// reading, which kept one of them. The strip of that margin is read on its own, enlarged, and each number found there
/// is added as a line of its own. Without them a question runs on into the next.
pub fn lines_with_gutter_labels(picture: &Picture) -> Vec<Line> {
    let lines = lines(picture);
    let Some((left, right)) = gutter_strip(&lines) else {
        return lines;
    };
    let Some(strip) = enlarged_strip(picture, left, right, GUTTER_ZOOM) else {
        return lines;
    };
    let found = read(&strip).unwrap_or_default();
    with_gutter_labels(lines, &found, left, GUTTER_ZOOM)
}

/// How much larger the margin strip is read.
const GUTTER_ZOOM: i32 = 3;

/// A question's number standing alone: "1.", "12)", "(3)".
fn is_lone_number(text: &str) -> bool {
    let text = text.trim();
    let body = text.strip_prefix('(').unwrap_or(text);
    let Some(last) = body.chars().last() else { return false };
    if last != '.' && last != ')' {
        return false;
    }
    let digits = &body[..body.len() - 1];
    (1..=2).contains(&digits.len()) && digits.chars().all(|c| c.is_ascii_digit())
}

/// The margin to read again, in the picture's pixels (left, right): from just left of the lone numbers to just left
/// of the text column on the first one's row. None when there is no lone number or no text beside it.
fn gutter_strip(lines: &[Line]) -> Option<(f64, f64)> {
    let lone: Vec<&Line> = lines.iter().filter(|line| is_lone_number(&line.text)).collect();
    let first = lone.first()?;
    let first_right = first.rect.x + first.rect.width;
    let first_mid = first.rect.y + first.rect.height / 2.0;
    let text_start = lines
        .iter()
        .filter(|line| {
            line.rect.x > first_right + 4.0
                && (line.rect.y + line.rect.height / 2.0 - first_mid).abs() < first.rect.height
        })
        .map(|line| line.rect.x)
        .fold(f64::INFINITY, f64::min);
    if !text_start.is_finite() {
        return None;
    }
    let left = (lone.iter().map(|line| line.rect.x).fold(f64::INFINITY, f64::min) - 8.0).max(0.0);
    let right = text_start - 2.0;
    (right - left >= 8.0).then_some((left, right))
}

/// The lines read on the enlarged strip that are question numbers, brought back to the picture's pixels and added
/// where no line is yet.
fn with_gutter_labels(mut lines: Vec<Line>, found: &[Line], left: f64, zoom: i32) -> Vec<Line> {
    let zoom = f64::from(zoom);
    for line in found {
        let text = line.text.trim();
        if !is_lone_number(text) {
            continue;
        }
        let rect = PixelRect {
            x: left + line.rect.x / zoom,
            y: line.rect.y / zoom,
            width: line.rect.width / zoom,
            height: line.rect.height / zoom,
        };
        let inner = PixelRect {
            x: rect.x + 1.0,
            y: rect.y + 1.0,
            width: (rect.width - 2.0).max(0.0),
            height: (rect.height - 2.0).max(0.0),
        };
        if lines.iter().any(|other| intersects(&other.rect, &inner)) {
            continue;
        }
        lines.push(Line {
            text: text.to_string(),
            rect,
        });
    }
    lines
}

fn intersects(a: &PixelRect, b: &PixelRect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/// The picture's columns `left..right`, the whole height, `zoom` times larger (each pixel the blend of its four
/// nearest, so the digits stay smooth for the OCR); None for an empty strip.
fn enlarged_strip(picture: &Picture, left: f64, right: f64, zoom: i32) -> Option<Picture> {
    let x0 = (left.floor() as i32).clamp(0, picture.width);
    let x1 = (right.ceil() as i32).clamp(0, picture.width);
    let source_width = x1 - x0;
    if source_width <= 0 || picture.height <= 0 || zoom <= 0 {
        return None;
    }
    let width = source_width * zoom;
    let height = picture.height * zoom;
    let at = |x: i32, y: i32, channel: usize| -> f64 {
        let x = x.clamp(0, source_width - 1) + x0;
        let y = y.clamp(0, picture.height - 1);
        f64::from(picture.bgra[((y * picture.width + x) * 4) as usize + channel])
    };
    let mut bgra = Vec::with_capacity((width * height * 4) as usize);
    let scale = f64::from(zoom);
    for row in 0..height {
        let sy = (f64::from(row) + 0.5) / scale - 0.5;
        let (y, fy) = (sy.floor() as i32, sy - sy.floor());
        for column in 0..width {
            let sx = (f64::from(column) + 0.5) / scale - 0.5;
            let (x, fx) = (sx.floor() as i32, sx - sx.floor());
            for channel in 0..4 {
                let top = at(x, y, channel) * (1.0 - fx) + at(x + 1, y, channel) * fx;
                let bottom = at(x, y + 1, channel) * (1.0 - fx) + at(x + 1, y + 1, channel) * fx;
                bgra.push((top * (1.0 - fy) + bottom * fy).round().clamp(0.0, 255.0) as u8);
            }
        }
    }
    Some(Picture { width, height, bgra })
}

fn read(picture: &Picture) -> windows::core::Result<Vec<Line>> {
    let Some(engine) = engine() else { return Ok(Vec::new()) };
    let limit = OcrEngine::MaxImageDimension()
        .map(|value| value as i32)
        .unwrap_or(10_000);
    let (width, height, mut bytes, factor) = within(picture, limit);
    // The engine reads opaque pixels: alpha set to full.
    for pixel in bytes.chunks_exact_mut(4) {
        pixel[3] = 255;
    }
    let buffer = CryptographicBuffer::CreateFromByteArray(&bytes)?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width, height)?;
    let result = engine.RecognizeAsync(&bitmap)?.join()?;
    let mut found = Vec::new();
    for line in result.Lines()? {
        let text = line.Text()?.to_string();
        let mut bounds: Option<(f64, f64, f64, f64)> = None;
        for word in line.Words()? {
            let rect = word.BoundingRect()?;
            let (x0, y0) = (f64::from(rect.X), f64::from(rect.Y));
            let (x1, y1) = (x0 + f64::from(rect.Width), y0 + f64::from(rect.Height));
            bounds = Some(match bounds {
                None => (x0, y0, x1, y1),
                Some((a, b, c, d)) => (a.min(x0), b.min(y0), c.max(x1), d.max(y1)),
            });
        }
        let Some((x0, y0, x1, y1)) = bounds else { continue };
        if text.trim().is_empty() {
            continue;
        }
        found.push(Line {
            text,
            rect: PixelRect {
                x: x0 * factor,
                y: y0 * factor,
                width: (x1 - x0) * factor,
                height: (y1 - y0) * factor,
            },
        });
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(text: &str, x: f64, y: f64, width: f64) -> Line {
        Line {
            text: text.to_string(),
            rect: PixelRect {
                x,
                y,
                width,
                height: 20.0,
            },
        }
    }

    #[test]
    fn question_numbers_alone_are_told_from_other_lines() {
        for text in ["1.", "12)", "(3)", " 4. "] {
            assert!(is_lone_number(text), "{text}");
        }
        for text in ["123.", "1", "a)", "1.5", "Um corpo", "(.", ""] {
            assert!(!is_lone_number(text), "{text}");
        }
    }

    #[test]
    fn the_margin_strip_runs_from_the_numbers_to_the_text() {
        let lines = vec![
            line("1.", 40.0, 100.0, 14.0),
            line("Um corpo de massa m desliza num plano inclinado.", 90.0, 98.0, 600.0),
            line("Determine a aceleração do corpo.", 90.0, 300.0, 400.0),
        ];
        assert_eq!(gutter_strip(&lines), Some((32.0, 88.0)));
        // No lone number, or no text on its row: nothing to read again.
        assert_eq!(gutter_strip(&lines[1..]), None);
        assert_eq!(gutter_strip(&[line("1.", 40.0, 100.0, 14.0)]), None);
    }

    #[test]
    fn numbers_found_in_the_margin_are_added_where_no_line_is() {
        let lines = vec![
            line("1.", 40.0, 100.0, 14.0),
            line("Um corpo de massa m desliza num plano inclinado.", 90.0, 98.0, 600.0),
            line("Determine a aceleração do corpo.", 90.0, 300.0, 400.0),
        ];
        // Read on the strip from x = 32, three times larger: "1." again, and the "2." the page-wide reading dropped.
        let found = vec![
            line("1.", 24.0, 300.0, 42.0),
            line("2.", 24.0, 900.0, 42.0),
            line("x", 24.0, 1200.0, 20.0),
        ];
        let merged = with_gutter_labels(lines, &found, 32.0, 3);
        assert_eq!(merged.len(), 4);
        let added = &merged[3];
        assert_eq!(added.text, "2.");
        assert_eq!(
            added.rect,
            PixelRect {
                x: 40.0,
                y: 300.0,
                width: 14.0,
                height: 20.0 / 3.0
            }
        );
    }

    #[test]
    fn the_strip_is_enlarged_whole() {
        let picture = Picture {
            width: 4,
            height: 2,
            bgra: (0..4 * 2 * 4).map(|value| value as u8).collect(),
        };
        let strip = enlarged_strip(&picture, 1.0, 3.0, 3).unwrap();
        assert_eq!((strip.width, strip.height), (6, 6));
        assert_eq!(strip.bgra.len(), 6 * 6 * 4);
        assert!(enlarged_strip(&picture, 3.0, 3.0, 3).is_none());
    }

    #[test]
    fn a_picture_larger_than_the_engine_takes_is_read_smaller_and_brought_back() {
        let picture = Picture {
            width: 30,
            height: 10,
            bgra: vec![7; 30 * 10 * 4],
        };
        let (width, height, bytes, factor) = within(&picture, 12);
        assert_eq!((width, height, factor), (10, 3, 3.0));
        assert_eq!(bytes.len(), 10 * 3 * 4);
        let (same_width, _, _, one) = within(&picture, 100);
        assert_eq!((same_width, one), (30, 1.0));
    }
}
