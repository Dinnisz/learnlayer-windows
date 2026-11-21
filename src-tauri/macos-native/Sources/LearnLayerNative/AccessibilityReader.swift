// Port of LearnLayer/Anywhere/AccessibilityReader.swift @ e0af40f. The Swift app decides here which part of what
// Accessibility exposes is the question; the shared app decides that in TypeScript (`core/anywhere/uiaQuestion.ts`,
// a port of the same decisions), so this side only gathers, in the shape Windows' UI Automation reader gives: a long
// text and where the point falls in it, or the block of elements around the point with its siblings.
// Frames go out in global pixels (points × the click monitor's scale), as the interface reads them.

import AppKit
import ApplicationServices
import Foundation

enum AccessibilityReader {
    /// Chrome and Electron apps build their accessibility tree only when asked; ask once per app.
    private static var enabledApps: Set<pid_t> = []
    private static let lock = NSLock()

    /// Asks a browser or Electron app to build its accessibility tree (as screen readers do).
    static func enable(_ pid: pid_t) {
        lock.withLock { _ = enabledApps.insert(pid) }
        let appElement = AXUIElementCreateApplication(pid)
        AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(appElement, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    }

    /// Browsers already open when ⌥-click is turned on: ready before the first click.
    static func enableRunningBrowsers() {
        let browsers = ["com.google.Chrome", "com.microsoft.edgemac", "com.brave.Browser", "company.thebrowser.Browser", "org.mozilla.firefox"]
        for app in NSWorkspace.shared.runningApplications where browsers.contains(app.bundleIdentifier ?? "") {
            enable(app.processIdentifier)
        }
    }

    /// What Accessibility exposes under `point` (global points, top-left origin), or nil when nothing readable is
    /// there, it is a password field, or it is LearnLayer's own.
    static func reading(at point: CGPoint, scale: Double) -> [String: Any]? {
        let systemWide = AXUIElementCreateSystemWide()
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &hit) == .success, let element = hit else {
            return nil
        }
        var pid: pid_t = 0
        AXUIElementGetPid(element, &pid)
        guard pid != ProcessInfo.processInfo.processIdentifier, !isPassword(element) else { return nil }
        let isNew = lock.withLock { !enabledApps.contains(pid) }
        if isNew { enable(pid) }
        if let found = read(element, at: point, scale: scale) { return found }
        // Between two lines: the nearest text under the container.
        if let near = nearestText(in: element, to: point), let found = read(near, at: point, scale: scale) { return found }
        // Chrome builds its tree a moment after it is asked: look again then.
        if isNew {
            Thread.sleep(forTimeInterval: 0.8)
            var again: AXUIElement?
            if AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &again) == .success, let again {
                return read(again, at: point, scale: scale)
            }
        }
        return nil
    }

    private static func read(_ element: AXUIElement, at point: CGPoint, scale: Double) -> [String: Any]? {
        let focus = string(element, kAXValueAttribute) ?? string(element, kAXTitleAttribute) ?? ""
        if let long = longText(element, at: point, scale: scale) {
            return ["longText": long, "block": NSNull(), "focus": focus]
        }
        if let block = block(around: element, scale: scale) {
            return ["longText": NSNull(), "block": block, "focus": focus]
        }
        return nil
    }

    private static func isPassword(_ element: AXUIElement) -> Bool {
        string(element, kAXRoleAttribute) == "AXSecureTextField" || string(element, kAXSubroleAttribute) == "AXSecureTextField"
    }

    /// The text element under `container` closest to `point`, within ~80 points.
    private static func nearestText(in container: AXUIElement, to point: CGPoint) -> AXUIElement? {
        var best: (element: AXUIElement, distance: CGFloat)?
        var visited = 0
        func walk(_ node: AXUIElement, depth: Int) {
            guard visited < 800, depth < 10 else { return }
            visited += 1
            if string(node, kAXRoleAttribute) == "AXStaticText", let frame = frame(of: node) {
                let dx = max(frame.minX - point.x, 0, point.x - frame.maxX)
                let dy = max(frame.minY - point.y, 0, point.y - frame.maxY)
                let distance = hypot(dx, dy)
                if distance < 80, distance < (best?.distance ?? .infinity) { best = (node, distance) }
                return
            }
            for child in children(of: node) { walk(child, depth: depth + 1) }
        }
        walk(container, depth: 0)
        return best?.element
    }

    // MARK: Long texts

    /// A long text (a document, a PDF in Preview): its whole text and the point's index in it, in UTF-16 units.
    private static func longText(_ element: AXUIElement, at point: CGPoint, scale: Double) -> [String: Any]? {
        guard let full = string(element, kAXValueAttribute), (full as NSString).length > 200 else { return nil }
        var axPoint = point
        guard let pointValue = AXValueCreate(.cgPoint, &axPoint) else { return nil }
        var rangeRef: CFTypeRef?
        guard AXUIElementCopyParameterizedAttributeValue(element, kAXRangeForPositionParameterizedAttribute as CFString, pointValue, &rangeRef) == .success,
              let rangeValue = rangeRef, CFGetTypeID(rangeValue) == AXValueGetTypeID()
        else { return nil }
        var hitRange = CFRange()
        AXValueGetValue(rangeValue as! AXValue, .cfRange, &hitRange)
        let length = (full as NSString).length
        let index = min(max(0, hitRange.location), length - 1)
        let frame = frame(of: element) ?? .zero
        return ["text": full, "index": index, "frame": pixelRect(frame, scale: scale)]
    }

    // MARK: Blocks (web pages)

    /// The smallest block around the element that reads like a whole question (`questionBlock`), with up to 15
    /// siblings either side: what the widening in TypeScript may take.
    private static func block(around element: AXUIElement, scale: Double) -> [String: Any]? {
        let screen = NSScreen.main?.frame.size ?? CGSize(width: 1440, height: 900)
        var current: AXUIElement? = element
        var bestNode: AXUIElement?
        for _ in 0..<12 {
            guard let node = current else { break }
            let role = string(node, kAXRoleAttribute) ?? ""
            if ["AXWindow", "AXApplication", "AXScrollArea"].contains(role) { break }
            let (text, _) = collectText(node)
            if let frame = frame(of: node), frame.height > screen.height * 0.85 || text.count > 3000 { break }
            if role != "AXWebArea", frame(of: node) != nil, text.count >= 12 {
                bestNode = node
                if text.count >= 80, role == "AXGroup" || role == "AXSection" || role == "AXList" || role == "AXForm" { break }
            }
            if role == "AXWebArea" { break }
            current = parent(of: node)
        }
        guard let chosen = bestNode else { return nil }
        let siblings = parent(of: chosen).map { children(of: $0) } ?? []
        guard siblings.count > 1, siblings.count < 3000, let index = siblings.firstIndex(where: { CFEqual($0, chosen) }) else {
            return ["index": 0, "nodes": [node(chosen, scale: scale)]]
        }
        let from = max(0, index - 15)
        let to = min(siblings.count, index + 16)
        return ["index": index - from, "nodes": siblings[from..<to].map { node($0, scale: scale) }]
    }

    private static func node(_ element: AXUIElement, scale: Double) -> [String: Any] {
        let (text, hasImage) = collectText(element)
        let role = string(element, kAXRoleAttribute) ?? ""
        let kind: String
        switch role {
        case "AXImage": kind = "image"
        case "AXLink": kind = "link"
        case "AXButton", "AXPopUpButton", "AXCheckBox", "AXRadioButton": kind = "button"
        case "AXStaticText", "AXTextArea", "AXTextField", "AXHeading": kind = "text"
        default: kind = "group"
        }
        let imageWithoutWords = role == "AXImage" && text.isEmpty
        return [
            "text": text, "frame": pixelRect(frame(of: element) ?? .zero, scale: scale), "kind": kind,
            "hasImage": hasImage || imageWithoutWords,
        ]
    }

    /// The text of an element and what's inside it, in reading order; the spoken or written form of maths
    /// (MathJax), and whether it has pictures.
    private static func collectText(_ root: AXUIElement) -> (String, Bool) {
        var pieces: [String] = []
        var hasImage = false
        var visited = 0
        func walk(_ node: AXUIElement, depth: Int) {
            guard visited < 600, depth < 14 else { return }
            visited += 1
            let role = string(node, kAXRoleAttribute) ?? ""
            switch role {
            case "AXButton", "AXPopUpButton", "AXCheckBox", "AXRadioButton", "AXSecureTextField":
                // "Ver Resposta", "Check": controls, not the question.
                return
            case "AXStaticText", "AXTextArea", "AXTextField", "AXHeading":
                if let value = string(node, kAXValueAttribute), !value.isEmpty { pieces.append(value) }
                if role != "AXHeading" { return }
            case "AXImage":
                var description = string(node, kAXDescriptionAttribute) ?? string(node, kAXTitleAttribute) ?? ""
                // Chrome's placeholder for an image with no description.
                if description.localizedCaseInsensitiveContains("image description") { description = "" }
                // An image of an equation usually has its formula as text; a figure doesn't.
                if description.isEmpty || description.count > 120 { hasImage = true } else { pieces.append(description) }
                return
            case "AXMath", "AXMathRoot":
                if let description = string(node, kAXDescriptionAttribute) ?? string(node, kAXValueAttribute) {
                    pieces.append(description)
                    return
                }
            default:
                break
            }
            for child in children(of: node) { walk(child, depth: depth + 1) }
        }
        walk(root, depth: 0)
        let text = pieces.joined(separator: " ")
            .replacingOccurrences(of: "[ \t]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (text, hasImage)
    }

    // MARK: Selected text

    /// The text selected in the app in front and where it is on screen; nil when nothing is selected, the app in
    /// front is LearnLayer, or the focus is a password field.
    static func selection(scale: Double) -> [String: Any]? {
        guard let front = NSWorkspace.shared.frontmostApplication,
              front.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return nil }
        let appElement = AXUIElementCreateApplication(front.processIdentifier)
        var focusedRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedRef) == .success,
              let focusedRef, CFGetTypeID(focusedRef) == AXUIElementGetTypeID()
        else { return nil }
        let focused = focusedRef as! AXUIElement
        guard !isPassword(focused) else { return nil }
        // The focused element, or (in a web page) the area holding the selection.
        for element in [focused] + ancestors(of: focused, upTo: 6) {
            // Web pages (Safari, Chrome) keep their selection as "text markers".
            if let marked = markedSelection(in: element) {
                return ["text": marked.text, "frame": pixelRect(marked.frame, scale: scale)]
            }
            guard let text = string(element, kAXSelectedTextAttribute)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  text.count >= 2
            else { continue }
            var frame = CGRect.null
            var rangeRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &rangeRef) == .success, let rangeRef,
               CFGetTypeID(rangeRef) == AXValueGetTypeID() {
                var boundsRef: CFTypeRef?
                if AXUIElementCopyParameterizedAttributeValue(element, kAXBoundsForRangeParameterizedAttribute as CFString, rangeRef, &boundsRef) == .success,
                   let boundsRef, CFGetTypeID(boundsRef) == AXValueGetTypeID() {
                    AXValueGetValue(boundsRef as! AXValue, .cgRect, &frame)
                }
            }
            if frame.isNull || frame.isEmpty { frame = Self.frame(of: element) ?? .zero }
            return ["text": text, "frame": pixelRect(frame, scale: scale)]
        }
        return nil
    }

    private static func markedSelection(in element: AXUIElement) -> (text: String, frame: CGRect)? {
        var markers: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, "AXSelectedTextMarkerRange" as CFString, &markers) == .success, let markers else { return nil }
        var textRef: CFTypeRef?
        guard AXUIElementCopyParameterizedAttributeValue(element, "AXStringForTextMarkerRange" as CFString, markers, &textRef) == .success,
              let text = (textRef as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), text.count >= 2
        else { return nil }
        var frame = CGRect.null
        var boundsRef: CFTypeRef?
        if AXUIElementCopyParameterizedAttributeValue(element, "AXBoundsForTextMarkerRange" as CFString, markers, &boundsRef) == .success,
           let boundsRef, CFGetTypeID(boundsRef) == AXValueGetTypeID() {
            AXValueGetValue(boundsRef as! AXValue, .cgRect, &frame)
        }
        return frame.isNull ? nil : (text, frame)
    }

    // MARK: The document a window shows

    /// The file a window shows (`AXDocument`, a file URL), as `PDFFigureSource` and `AnywhereController.focusedPDF`
    /// read it: the window under `point`, else the focused window of the app `pid`. Only PDFs.
    static func pdfPath(pid: pid_t, at point: CGPoint) -> String? {
        var windows: [AXUIElement] = []
        var hit: AXUIElement?
        if AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(point.x), Float(point.y), &hit) == .success, let hit {
            var node: AXUIElement? = hit
            for _ in 0..<40 {
                guard let current = node else { break }
                if string(current, kAXRoleAttribute) == "AXWindow" {
                    windows.append(current)
                    break
                }
                node = parent(of: current)
            }
        }
        var focused: CFTypeRef?
        if AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute as CFString, &focused) == .success,
           let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() {
            windows.append(focused as! AXUIElement)
        }
        for window in windows {
            guard let document = string(window, kAXDocumentAttribute), let url = URL(string: document), url.isFileURL,
                  url.pathExtension.lowercased() == "pdf", FileManager.default.isReadableFile(atPath: url.path)
            else { continue }
            return url.path
        }
        return nil
    }

    // MARK: Small helpers

    static func string(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        if let text = value as? String { return text }
        if let attributed = value as? NSAttributedString { return attributed.string }
        return nil
    }

    private static func children(of element: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success else { return [] }
        return (value as? [AXUIElement]) ?? []
    }

    private static func parent(of element: AXUIElement) -> AXUIElement? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &value) == .success, let value,
              CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }

    private static func ancestors(of element: AXUIElement, upTo count: Int) -> [AXUIElement] {
        var result: [AXUIElement] = []
        var current = parent(of: element)
        while let node = current, result.count < count {
            result.append(node)
            current = parent(of: node)
        }
        return result
    }

    static func frame(of element: AXUIElement) -> CGRect? {
        var positionRef: CFTypeRef?, sizeRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionRef) == .success,
              AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef) == .success,
              let positionRef, let sizeRef
        else { return nil }
        var position = CGPoint.zero, size = CGSize.zero
        AXValueGetValue(positionRef as! AXValue, .cgPoint, &position)
        AXValueGetValue(sizeRef as! AXValue, .cgSize, &size)
        return CGRect(origin: position, size: size)
    }
}

// MARK: C boundary

@_cdecl("ll_read_at")
public func llReadAt(_ x: Double, _ y: Double, _ scale: Double) -> UnsafeMutablePointer<CChar>? {
    jsonString(AccessibilityReader.reading(at: CGPoint(x: x, y: y), scale: scale))
}

@_cdecl("ll_selection")
public func llSelection(_ scale: Double) -> UnsafeMutablePointer<CChar>? {
    jsonString(AccessibilityReader.selection(scale: scale))
}

@_cdecl("ll_pdf_path")
public func llPDFPath(_ pid: Int32, _ x: Double, _ y: Double) -> UnsafeMutablePointer<CChar>? {
    guard let path = AccessibilityReader.pdfPath(pid: pid, at: CGPoint(x: x, y: y)) else { return nil }
    return strdup(path)
}

@_cdecl("ll_enable_running_browsers")
public func llEnableRunningBrowsers() {
    AccessibilityReader.enableRunningBrowsers()
}
