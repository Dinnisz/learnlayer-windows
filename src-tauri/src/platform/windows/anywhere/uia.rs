//! What UI Automation exposes under a point: the Windows side of LearnLayer/Anywhere/AccessibilityReader.swift
//! @ ref 2026-11-04. Exact, local and free. This side only gathers (a document's text and where the point falls in
//! it, or the block of elements around the point and its siblings); which part of that is the question is decided
//! in TypeScript (`core/anywhere/uiaQuestion.ts`), where it is tested.
//!
//! Nothing is read from a password field, nor from LearnLayer's own windows. Chrome and Edge build their tree only
//! once a client asks: the first look at a new app is repeated once after a moment.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern, IUIAutomationTreeWalker,
    IUIAutomationValuePattern, TextPatternRangeEndpoint_End, TextPatternRangeEndpoint_Start, UIA_ButtonControlTypeId,
    UIA_CheckBoxControlTypeId, UIA_ComboBoxControlTypeId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
    UIA_GroupControlTypeId, UIA_HeaderControlTypeId, UIA_HyperlinkControlTypeId, UIA_ImageControlTypeId,
    UIA_ListControlTypeId, UIA_RadioButtonControlTypeId, UIA_TextControlTypeId, UIA_TextPatternId, UIA_ValuePatternId,
    UIA_WindowControlTypeId, UIA_CONTROLTYPE_ID,
};

/// A rectangle in physical pixels, global.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Default)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl From<RECT> for Frame {
    fn from(rect: RECT) -> Self {
        Frame {
            x: f64::from(rect.left),
            y: f64::from(rect.top),
            width: f64::from(rect.right - rect.left),
            height: f64::from(rect.bottom - rect.top),
        }
    }
}

/// A document's whole text (up to `MAX_DOCUMENT`) and where the point falls in it, in UTF-16 units.
#[derive(Debug, Clone, Serialize)]
pub struct LongText {
    pub text: String,
    pub index: usize,
    pub frame: Frame,
}

/// One element of the block around the point: its text, frame, and what kind of element it is.
#[derive(Debug, Clone, Serialize)]
pub struct Node {
    pub text: String,
    pub frame: Frame,
    /// "text", "image", "link", "button" or "group".
    pub kind: &'static str,
    /// A picture inside it with no description (a figure).
    #[serde(rename = "hasImage")]
    pub has_image: bool,
}

/// The block around the point: the element chosen (`index` in `nodes`) and its siblings, in order.
#[derive(Debug, Clone, Serialize)]
pub struct Block {
    pub index: usize,
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Reading {
    #[serde(rename = "longText")]
    pub long_text: Option<LongText>,
    pub block: Option<Block>,
    /// The text right under the pointer (the element's own), to tell which part was clicked.
    pub focus: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Selection {
    pub text: String,
    pub frame: Frame,
}

const MAX_DOCUMENT: i32 = 30_000;
const MAX_NODES: usize = 600;

/// Apps whose tree has been asked for: a new one is looked at again after a moment (Chrome builds it on request).
static ASKED: Mutex<Option<HashSet<i32>>> = Mutex::new(None);

pub struct Reader {
    automation: IUIAutomation,
    walker: IUIAutomationTreeWalker,
    screen_height: f64,
}

fn text_of(value: windows::core::Result<windows::core::BSTR>) -> String {
    value.map(|text| text.to_string()).unwrap_or_default()
}

impl Reader {
    /// One per thread: COM is set up on the calling thread (multithreaded).
    pub fn new(screen_height: f64) -> Option<Reader> {
        // SAFETY: COM on this thread, then the UI Automation client object.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let walker = automation.ControlViewWalker().ok()?;
            Some(Reader {
                automation,
                walker,
                screen_height,
            })
        }
    }

    fn element_at(&self, point: POINT) -> Option<IUIAutomationElement> {
        // SAFETY: a COM call on our own client object.
        unsafe { self.automation.ElementFromPoint(point).ok() }
    }

    fn parent(&self, element: &IUIAutomationElement) -> Option<IUIAutomationElement> {
        // SAFETY: a COM call; the walker and element are alive.
        unsafe { self.walker.GetParentElement(element).ok() }
    }

    fn children(&self, element: &IUIAutomationElement, limit: usize) -> Vec<IUIAutomationElement> {
        let mut found = Vec::new();
        // SAFETY: COM calls walking the tree; each element returned is owned here.
        unsafe {
            let mut next = self.walker.GetFirstChildElement(element).ok();
            while let Some(child) = next {
                if found.len() >= limit {
                    break;
                }
                next = self.walker.GetNextSiblingElement(&child).ok();
                found.push(child);
            }
        }
        found
    }

    /// The question's raw material under `point`, or None for a password field, LearnLayer, or nothing readable.
    pub fn reading_at(&self, point: POINT) -> Option<Reading> {
        let element = self.element_at(point)?;
        // SAFETY: COM property reads.
        let process = unsafe { element.CurrentProcessId() }.ok()?;
        // SAFETY: reads this process's id.
        if process as u32 == unsafe { GetCurrentProcessId() } || is_password(&element) {
            return None;
        }
        let is_new = ASKED
            .lock()
            .ok()
            .is_some_and(|mut asked| asked.get_or_insert_with(HashSet::new).insert(process));
        if let Some(found) = self.read(&element, point) {
            return Some(found);
        }
        if is_new {
            // Chrome builds its tree a moment after it is asked: look again then.
            std::thread::sleep(Duration::from_millis(800));
            let again = self.element_at(point)?;
            return self.read(&again, point);
        }
        None
    }

    fn read(&self, element: &IUIAutomationElement, point: POINT) -> Option<Reading> {
        let focus = self.own_text(element);
        let long_text = self.long_text(element, point);
        let block = if long_text.is_some() { None } else { self.block(element) };
        (long_text.is_some() || block.is_some()).then_some(Reading {
            long_text,
            block,
            focus,
        })
    }

    /// A long text (a document, a PDF in a viewer that exposes it): its text and where the point is in it.
    fn long_text(&self, element: &IUIAutomationElement, point: POINT) -> Option<LongText> {
        let mut current = Some(element.clone());
        for _ in 0..10 {
            let node = current?;
            // SAFETY: COM calls on live elements and ranges.
            unsafe {
                if let Ok(pattern) = node.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
                    let document = pattern.DocumentRange().ok()?;
                    let text = text_of(document.GetText(MAX_DOCUMENT));
                    if text.encode_utf16().count() <= 200 {
                        return None;
                    }
                    let hit = pattern.RangeFromPoint(point).ok()?;
                    // From the document's start to the point: its length is the point's index.
                    let before = document.Clone().ok()?;
                    before
                        .MoveEndpointByRange(TextPatternRangeEndpoint_End, &hit, TextPatternRangeEndpoint_Start)
                        .ok()?;
                    let index = text_of(before.GetText(MAX_DOCUMENT)).encode_utf16().count();
                    let frame = node.CurrentBoundingRectangle().map(Frame::from).unwrap_or_default();
                    return Some(LongText { text, index, frame });
                }
            }
            current = self.parent(&node);
        }
        None
    }

    fn control_type(element: &IUIAutomationElement) -> UIA_CONTROLTYPE_ID {
        // SAFETY: a COM property read.
        unsafe { element.CurrentControlType() }.unwrap_or_default()
    }

    fn frame(element: &IUIAutomationElement) -> Frame {
        // SAFETY: a COM property read.
        unsafe { element.CurrentBoundingRectangle() }
            .map(Frame::from)
            .unwrap_or_default()
    }

    /// The element's own words: its name, or the value of a text field.
    fn own_text(&self, element: &IUIAutomationElement) -> String {
        // SAFETY: COM property reads.
        unsafe {
            if Self::control_type(element) == UIA_EditControlTypeId {
                if let Ok(value) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
                    let text = text_of(value.CurrentValue());
                    if !text.is_empty() {
                        return text;
                    }
                }
            }
            text_of(element.CurrentName())
        }
    }

    /// The text of an element and what's inside it, in reading order, and whether it has pictures (`collectText`).
    fn collect_text(&self, root: &IUIAutomationElement) -> (String, bool) {
        let mut pieces = Vec::new();
        let mut has_image = false;
        let mut visited = 0;
        self.walk(root, 0, &mut visited, &mut pieces, &mut has_image);
        let text = pieces.join(" ").split_whitespace().collect::<Vec<_>>().join(" ");
        (text, has_image)
    }

    fn walk(
        &self,
        node: &IUIAutomationElement,
        depth: usize,
        visited: &mut usize,
        pieces: &mut Vec<String>,
        image: &mut bool,
    ) {
        if *visited >= MAX_NODES || depth >= 14 {
            return;
        }
        *visited += 1;
        let kind = Self::control_type(node);
        if [
            UIA_ButtonControlTypeId,
            UIA_CheckBoxControlTypeId,
            UIA_RadioButtonControlTypeId,
            UIA_ComboBoxControlTypeId,
        ]
        .contains(&kind)
        {
            // "Ver Resposta", "Check": controls, not the question.
            return;
        }
        if kind == UIA_TextControlTypeId || kind == UIA_EditControlTypeId || kind == UIA_HeaderControlTypeId {
            let text = self.own_text(node);
            if !text.is_empty() {
                pieces.push(text);
            }
            if kind != UIA_HeaderControlTypeId {
                return;
            }
        }
        if kind == UIA_ImageControlTypeId {
            // An image of an equation usually has its formula as text; a figure doesn't.
            let description = self.own_text(node);
            let empty = description.is_empty() || description.to_lowercase().contains("image description");
            if empty || description.chars().count() > 120 {
                *image = true;
            } else {
                pieces.push(description);
            }
            return;
        }
        for child in self.children(node, MAX_NODES) {
            self.walk(&child, depth + 1, visited, pieces, image);
        }
    }

    fn kind_name(kind: UIA_CONTROLTYPE_ID) -> &'static str {
        match kind {
            k if k == UIA_ImageControlTypeId => "image",
            k if k == UIA_HyperlinkControlTypeId => "link",
            k if k == UIA_ButtonControlTypeId => "button",
            k if k == UIA_TextControlTypeId || k == UIA_EditControlTypeId || k == UIA_HeaderControlTypeId => "text",
            _ => "group",
        }
    }

    /// The smallest block around the element that reads like a whole question (`questionBlock`), with its siblings.
    fn block(&self, element: &IUIAutomationElement) -> Option<Block> {
        let mut current = Some(element.clone());
        let mut best: Option<IUIAutomationElement> = None;
        for _ in 0..12 {
            let Some(node) = current else { break };
            let kind = Self::control_type(&node);
            if kind == UIA_WindowControlTypeId {
                break;
            }
            let (text, _) = self.collect_text(&node);
            let frame = Self::frame(&node);
            if frame.height > self.screen_height * 0.85 || text.chars().count() > 3000 {
                break;
            }
            if kind != UIA_DocumentControlTypeId && text.chars().count() >= 12 {
                best = Some(node.clone());
                let container = kind == UIA_GroupControlTypeId || kind == UIA_ListControlTypeId;
                if text.chars().count() >= 80 && container {
                    break;
                }
            }
            if kind == UIA_DocumentControlTypeId {
                break;
            }
            current = self.parent(&node);
        }
        let chosen = best?;
        let siblings = self
            .parent(&chosen)
            .map(|parent| self.children(&parent, 3000))
            .unwrap_or_default();
        // SAFETY: compares two elements of the same tree.
        let index = siblings.iter().position(|sibling| unsafe {
            self.automation
                .CompareElements(sibling, &chosen)
                .map(|same| same.as_bool())
                .unwrap_or(false)
        });
        let (Some(index), true) = (index, siblings.len() > 1) else {
            let (text, has_image) = self.collect_text(&chosen);
            let node = Node {
                text,
                frame: Self::frame(&chosen),
                kind: Self::kind_name(Self::control_type(&chosen)),
                has_image,
            };
            return Some(Block {
                index: 0,
                nodes: vec![node],
            });
        };
        // Up to 15 siblings either side: what the widening in TypeScript may take.
        let from = index.saturating_sub(15);
        let to = (index + 16).min(siblings.len());
        let nodes = siblings[from..to]
            .iter()
            .map(|sibling| {
                let (text, has_image) = self.collect_text(sibling);
                Node {
                    text,
                    frame: Self::frame(sibling),
                    kind: Self::kind_name(Self::control_type(sibling)),
                    has_image,
                }
            })
            .collect();
        Some(Block {
            index: index - from,
            nodes,
        })
    }

    /// The text selected in the app in front, and where it is; None when nothing is selected.
    pub fn selection(&self) -> Option<Selection> {
        // SAFETY: COM calls on the focused element and its text pattern.
        unsafe {
            let focused = self.automation.GetFocusedElement().ok()?;
            if focused.CurrentProcessId().ok()? as u32 == GetCurrentProcessId() || is_password(&focused) {
                return None;
            }
            let mut current = Some(focused);
            for _ in 0..7 {
                let node = current?;
                if let Ok(pattern) = node.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
                    let ranges = pattern.GetSelection().ok()?;
                    if ranges.Length().ok()? < 1 {
                        return None;
                    }
                    let text = text_of(ranges.GetElement(0).ok()?.GetText(5_000)).trim().to_string();
                    if text.chars().count() < 2 {
                        return None;
                    }
                    return Some(Selection {
                        text,
                        frame: Self::frame(&node),
                    });
                }
                current = self.parent(&node);
            }
            None
        }
    }

    /// A browser's address bar showing a local PDF ("file:///C:/…/exame.pdf"), under `window`.
    pub fn address_bar_file(&self, window: &IUIAutomationElement) -> Option<String> {
        let mut queue = vec![window.clone()];
        let mut visited = 0;
        while let Some(node) = queue.pop() {
            visited += 1;
            if visited > 400 {
                break;
            }
            if Self::control_type(&node) == UIA_EditControlTypeId {
                let value = self.own_text(&node);
                let lower = value.to_lowercase();
                if lower.starts_with("file:///")
                    && lower
                        .split(['?', '#'])
                        .next()
                        .is_some_and(|path| path.ends_with(".pdf"))
                {
                    return Some(value);
                }
            }
            let mut children = self.children(&node, 60);
            children.reverse();
            queue.extend(children);
        }
        None
    }

    /// The element of a top-level window, for `address_bar_file`.
    pub fn window_element(&self, handle: isize) -> Option<IUIAutomationElement> {
        // SAFETY: a COM call with a window handle that may already be gone (then it fails).
        unsafe {
            self.automation
                .ElementFromHandle(windows::Win32::Foundation::HWND(handle as *mut core::ffi::c_void))
                .ok()
        }
    }
}

fn is_password(element: &IUIAutomationElement) -> bool {
    // SAFETY: a COM property read.
    unsafe { element.CurrentIsPassword() }
        .map(|value| value.as_bool())
        .unwrap_or(true)
}
