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
    read(&without_fills(picture)).unwrap_or_default()
}

/// `lines`, with the question numbers set apart in a margin column read again (`QuestionRegion.withGutterLabels` @
/// 5701363): numbers far left of the text ("1." beside "Um corpo de massa…") are often dropped by the page-wide
/// reading, which kept one of them. The strip of that margin is read on its own, enlarged, and each number found there
/// is added as a line of its own. Without them a question runs on into the next.
pub fn lines_with_gutter_labels(picture: &Picture) -> Vec<Line> {
    let picture = &without_fills(picture);
    let lines = read(picture).unwrap_or_default();
    let Some((left, right)) = gutter_strip(&lines) else {
        return lines;
    };
    let limit = OcrEngine::MaxImageDimension()
        .map(|value| value as i32)
        .unwrap_or(10_000);
    let zoom = gutter_zoom(picture.height, limit);
    let Some(strip) = enlarged_strip(picture, left, right, zoom) else {
        return lines;
    };
    let found = read(&strip).unwrap_or_default();
    with_gutter_labels(lines, &found, left, zoom)
}

/// How much larger the margin strip is read: three times, or as much as the engine takes whole (a strip it would
/// read smaller again gains nothing from being enlarged).
fn gutter_zoom(height: i32, limit: i32) -> i32 {
    if height <= 0 {
        return 1;
    }
    (limit / height).clamp(1, 3)
}

/// A light flat fill: a box of one colour, in pixels, `[left, right)` × `[top, bottom)`.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Fill {
    colour: [u8; 3],
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
}

/// The picture with the small light fills behind its labels made white (the grey pill round an exam's item number,
/// "* 1.1."): the engine drops dark text on such a fill. A fill is found from rows with a run of at least
/// `FILL_RUN` pixels of one light colour, joined with the runs of that colour on the rows next to it; inside a
/// fill no larger than a label, and a few pixels past its rounded ends, every light pixel becomes white. Text
/// elsewhere, and a page or a panel with a tinted background, is left as it was.
pub fn without_fills(picture: &Picture) -> Picture {
    const LIGHT_INK: u32 = 180;
    const PAST_ENDS: usize = 3;
    let mut bgra = picture.bgra.clone();
    let width = picture.width.max(0) as usize;
    let height = picture.height.max(0) as usize;
    for fill in label_fills(&picture.bgra, width, height) {
        let left = fill.left.saturating_sub(PAST_ENDS);
        let right = (fill.right + PAST_ENDS).min(width);
        let top = fill.top.saturating_sub(1);
        let bottom = (fill.bottom + 1).min(height);
        for row in top..bottom {
            for column in left..right {
                let at = (row * width + column) * 4;
                if luma([bgra[at], bgra[at + 1], bgra[at + 2]]) >= LIGHT_INK {
                    bgra[at..at + 3].copy_from_slice(&[255, 255, 255]);
                }
            }
        }
    }
    Picture {
        width: picture.width,
        height: picture.height,
        bgra,
    }
}

fn luma(colour: [u8; 3]) -> u32 {
    (u32::from(colour[2]) * 3 + u32::from(colour[1]) * 6 + u32::from(colour[0])) / 10
}

/// The light fills of a label's size: at most `MAX_HEIGHT` tall and `MAX_WIDTH` wide, so a tinted page or panel
/// (where thinning the letters would cost more than it gains) is never one.
fn label_fills(bgra: &[u8], width: usize, height: usize) -> Vec<Fill> {
    const FILL_RUN: usize = 12;
    const LIGHT: u32 = 160;
    const SAME: i32 = 6;
    const MAX_HEIGHT: usize = 80;
    const MAX_WIDTH: usize = 400;
    let close =
        |a: [u8; 3], b: [u8; 3]| (0..3).all(|channel| (i32::from(a[channel]) - i32::from(b[channel])).abs() <= SAME);
    let mut fills: Vec<Fill> = Vec::new();
    if bgra.len() < width * height * 4 {
        return fills;
    }
    for row in 0..height {
        let pixel = |column: usize| {
            let at = (row * width + column) * 4;
            [bgra[at], bgra[at + 1], bgra[at + 2]]
        };
        let mut start = 0;
        while start < width {
            let first = pixel(start);
            let mut end = start + 1;
            while end < width && close(pixel(end), first) {
                end += 1;
            }
            if end - start >= FILL_RUN && first != [255, 255, 255] && luma(first) >= LIGHT {
                // The fill this run continues: the same colour, on the row above, overlapping it.
                let joined = fills.iter_mut().rev().find(|fill| {
                    close(fill.colour, first) && fill.bottom >= row && fill.left < end && start < fill.right
                });
                match joined {
                    Some(fill) => {
                        fill.left = fill.left.min(start);
                        fill.right = fill.right.max(end);
                        fill.bottom = row + 1;
                    }
                    None => fills.push(Fill {
                        colour: first,
                        left: start,
                        right: end,
                        top: row,
                        bottom: row + 1,
                    }),
                }
            }
            start = end;
        }
    }
    fills
        .into_iter()
        .filter(|fill| {
            fill.bottom - fill.top >= 4 && fill.bottom - fill.top <= MAX_HEIGHT && fill.right - fill.left <= MAX_WIDTH
        })
        .collect()
}

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
    fn the_margin_is_enlarged_only_as_far_as_the_engine_reads_whole() {
        assert_eq!(gutter_zoom(700, 10_000), 3);
        assert_eq!(gutter_zoom(1_000, 2_600), 2);
        assert_eq!(gutter_zoom(2_160, 2_600), 1);
        assert_eq!(gutter_zoom(0, 2_600), 1);
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

    /// A measurement, not a check: reads a page saved as raw BGRA (`<base>.bgra` and `<base>.txt` with "width
    /// height") and prints the lines as the app reads them, "+" where the engine alone, on the untouched picture,
    /// reads that line otherwise or not at all. `LEARNLAYER_OCR_PAGE=<base> cargo test
    /// ocr_on_a_saved_page -- --ignored --nocapture`; `scripts/render-page.mjs` saves a PDF page that way.
    #[test]
    #[ignore]
    fn ocr_on_a_saved_page() {
        let base = std::env::var("LEARNLAYER_OCR_PAGE").expect("LEARNLAYER_OCR_PAGE");
        let size = std::fs::read_to_string(format!("{base}.txt")).expect("size");
        let mut parts = size.split_whitespace().map(|part| part.parse::<i32>().expect("number"));
        let (width, height) = (parts.next().expect("width"), parts.next().expect("height"));
        let bgra = std::fs::read(format!("{base}.bgra")).expect("pixels");
        assert_eq!(bgra.len(), (width * height * 4) as usize);
        let picture = Picture { width, height, bgra };
        let started = std::time::Instant::now();
        let _ = without_fills(&picture);
        println!("fills: {:?}", started.elapsed());
        let engine = read(&picture).unwrap_or_default();
        println!("margin strip: {:?}", gutter_strip(&engine));
        for line in &lines_with_gutter_labels(&picture) {
            let added = !engine.iter().any(|seen| seen.text == line.text);
            println!(
                "{} {:>6.0} {:>6.0} {:>6.0}  {}",
                if added { "+" } else { " " },
                line.rect.x,
                line.rect.y,
                line.rect.width,
                line.text
            );
        }
    }

    /// A white picture `width` × `height`, with `paint(column, row)` giving the pixels that are not white.
    fn painted(width: i32, height: i32, paint: impl Fn(i32, i32) -> Option<[u8; 3]>) -> Picture {
        let mut bgra = Vec::with_capacity((width * height * 4) as usize);
        for row in 0..height {
            for column in 0..width {
                let [b, g, r] = paint(column, row).unwrap_or([255, 255, 255]);
                bgra.extend_from_slice(&[b, g, r, 255]);
            }
        }
        Picture { width, height, bgra }
    }

    fn colour(picture: &Picture, column: i32, row: i32) -> [u8; 3] {
        let at = ((row * picture.width + column) * 4) as usize;
        [picture.bgra[at], picture.bgra[at + 1], picture.bgra[at + 2]]
    }

    const PILL: [u8; 3] = [199, 197, 196];
    const INK: [u8; 3] = [53, 46, 44];
    const EDGE: [u8; 3] = [210, 208, 207];

    #[test]
    fn the_grey_pill_round_an_item_number_is_made_white_and_its_ink_kept() {
        // A pill 60 × 20 at (10, 10); a stroke of ink inside it with a light edge, a grey letter outside.
        let picture = painted(120, 40, |column, row| {
            let inside = (10..70).contains(&column) && (10..30).contains(&row);
            if inside && (30..33).contains(&column) && (14..26).contains(&row) {
                Some(INK)
            } else if inside && column == 33 && (14..26).contains(&row) {
                Some(EDGE)
            } else if inside {
                Some(PILL)
            } else if column == 90 && row == 20 {
                Some([150, 150, 150])
            } else {
                None
            }
        });
        let fills = label_fills(&picture.bgra, 120, 40);
        assert_eq!(fills.len(), 1);
        assert_eq!(
            (fills[0].left, fills[0].right, fills[0].top, fills[0].bottom),
            (10, 70, 10, 30)
        );
        let clean = without_fills(&picture);
        assert_eq!(colour(&clean, 12, 12), [255, 255, 255]);
        assert_eq!(colour(&clean, 50, 20), [255, 255, 255]);
        assert_eq!(colour(&clean, 33, 20), [255, 255, 255]);
        assert_eq!(colour(&clean, 31, 20), INK);
        // Outside the pill nothing changes.
        assert_eq!(colour(&clean, 90, 20), [150, 150, 150]);
    }

    #[test]
    fn a_tinted_panel_and_short_runs_are_not_fills() {
        // A panel larger than a label, and short grey dashes: both as they were.
        let picture = painted(600, 200, |column, row| {
            if (0..500).contains(&column) && (0..120).contains(&row) {
                Some([240, 240, 240])
            } else if row == 150 && column % 10 < 5 {
                Some([200, 200, 200])
            } else {
                None
            }
        });
        assert!(label_fills(&picture.bgra, 600, 200).is_empty());
        assert_eq!(without_fills(&picture).bgra, picture.bgra);
        // A dark fill (a black box) is ink, never a fill.
        let dark = painted(100, 30, |_, row| (5..25).contains(&row).then_some([40, 40, 40]));
        assert!(label_fills(&dark.bgra, 100, 30).is_empty());
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
