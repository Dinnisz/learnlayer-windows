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
