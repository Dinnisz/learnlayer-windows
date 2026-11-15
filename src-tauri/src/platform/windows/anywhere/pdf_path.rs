//! The PDF a window shows, when its file can be found: the counterpart of `PDFFigureSource.documentURL` (the Mac asks
//! Accessibility for `AXDocument`; Windows viewers don't say). In order: a browser's address bar with a local
//! `file:///…pdf` (Edge, Chrome), the window's title ("exame.pdf - Adobe Acrobat Reader", "exame.pdf - SumatraPDF",
//! a full path when the viewer shows one) found in the student's usual folders. The file is only ever read here, on
//! this computer.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// "file:///C:/Users/Ana/Downloads/exame%20MatA.pdf" → that path, when it is a local PDF that exists.
pub fn from_file_url(url: &str) -> Option<PathBuf> {
    let parsed = url::Url::parse(url.trim()).ok()?;
    if parsed.scheme() != "file" {
        return None;
    }
    let path = parsed.to_file_path().ok()?;
    is_pdf(&path).then_some(path)
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
        && path.is_file()
}

/// The PDF's file name (or full path) in a window title, as viewers write it.
pub fn name_in_title(title: &str) -> Option<String> {
    let lower = title.to_ascii_lowercase();
    let end = lower.find(".pdf")? + 4;
    let head = &title[..end];
    // A full path ("C:\…\exame.pdf - SumatraPDF") is kept whole; else the name after the last separator
    // ("Adobe Acrobat Reader - [exame.pdf]" or "* exame.pdf").
    if let Some(start) = head.find(":\\").and_then(|at| at.checked_sub(1)) {
        return Some(head[start..].to_string());
    }
    let start = head
        .rfind(['[', '*', '/', '\\', '|', '—', '–'])
        .map(|at| at + head[at..].chars().next().map_or(1, char::len_utf8));
    let name = head[start.unwrap_or(0)..].trim();
    (!name.is_empty()).then(|| name.trim_start_matches(['-', ' ']).to_string())
}

/// The folders a student's PDFs are usually in.
fn usual_folders() -> Vec<PathBuf> {
    let mut folders = Vec::new();
    if let Some(home) = std::env::var_os("USERPROFILE").map(PathBuf::from) {
        for name in [
            "Downloads",
            "Desktop",
            "Documents",
            "OneDrive",
            "OneDrive\\Documents",
            "OneDrive\\Desktop",
        ] {
            folders.push(home.join(name));
        }
    }
    folders
}

/// The newest file called `name` in `folder` and its subfolders, at most `depth` deep (and 4000 entries in all).
fn find(folder: &Path, name: &str, depth: usize, seen: &mut usize, best: &mut Option<(SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(folder) else { return };
    for entry in entries.flatten() {
        *seen += 1;
        if *seen > 4000 {
            return;
        }
        let path = entry.path();
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() && depth > 0 {
            find(&path, name, depth - 1, seen, best);
        } else if kind.is_file() && entry.file_name().to_string_lossy().eq_ignore_ascii_case(name) {
            let modified = entry
                .metadata()
                .and_then(|meta| meta.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            if best.as_ref().map_or(true, |(time, _)| modified > *time) {
                *best = Some((modified, path));
            }
        }
    }
}

/// The file a window titled `title` shows, when it can be found.
pub fn from_title(title: &str) -> Option<PathBuf> {
    let named = name_in_title(title)?;
    let path = PathBuf::from(&named);
    if path.is_absolute() {
        return is_pdf(&path).then_some(path);
    }
    let mut best = None;
    let mut seen = 0;
    for folder in usual_folders() {
        find(&folder, &named, 2, &mut seen, &mut best);
    }
    best.map(|(_, path)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewers_titles_give_the_file_name() {
        assert_eq!(
            name_in_title("exame-MatA-2024.pdf - Adobe Acrobat Reader (64-bit)").as_deref(),
            Some("exame-MatA-2024.pdf")
        );
        assert_eq!(
            name_in_title("Teste 1.pdf - SumatraPDF").as_deref(),
            Some("Teste 1.pdf")
        );
        assert_eq!(
            name_in_title("C:\\Users\\Ana\\Downloads\\exame.pdf - SumatraPDF").as_deref(),
            Some("C:\\Users\\Ana\\Downloads\\exame.pdf")
        );
        assert_eq!(name_in_title("* exame.PDF — Leitor").as_deref(), Some("exame.PDF"));
        assert_eq!(name_in_title("Moodle — Matemática A"), None);
    }

    #[test]
    fn a_file_url_is_a_path_only_when_it_is_a_local_pdf() {
        assert_eq!(from_file_url("https://example.com/a.pdf"), None);
        assert_eq!(from_file_url("file:///C:/does/not/exist.pdf"), None);
        let file = std::env::temp_dir().join("learnlayer-test-file-url.pdf");
        std::fs::write(&file, b"%PDF-1.4").unwrap();
        let url = url::Url::from_file_path(&file).unwrap();
        assert_eq!(from_file_url(url.as_str()), Some(file.clone()));
        let _ = std::fs::remove_file(file);
    }
}
