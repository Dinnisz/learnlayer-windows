// Port of LearnLayer/Notch/NotchPillController.swift @ e0af40f: the pill lives in the notch of the main screen, at
// the menu bar's level, on every Space and over full-screen apps. On a screen without a notch it sits as a small pill
// at the top centre of the menu bar. The pill's look is the interface's (ui/windows/pill); this only places the window.

import AppKit
import WebKit

enum NotchPill {
    /// The notch's frame on `screen` (AppKit coordinates), or a pill-sized gap in the middle of the menu bar when the
    /// screen has none (`notchFrame(on:)`).
    static func notchFrame(on screen: NSScreen) -> (frame: CGRect, real: Bool) {
        let top = screen.frame.maxY
        if let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea, screen.safeAreaInsets.top > 0 {
            let height = screen.safeAreaInsets.top
            return (CGRect(x: left.maxX, y: top - height, width: right.minX - left.maxX, height: height), true)
        }
        let height = NSStatusBar.system.thickness
        return (CGRect(x: screen.frame.midX - 40, y: top - height, width: 80, height: height), false)
    }

    static var mainScreen: NSScreen? { NSScreen.screens.first }

    /// The pill's window (`makePanel`): at the status bar's level, see-through, never moved, on every Space.
    static func configure(_ window: NSWindow) {
        window.level = .statusBar
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.isMovable = false
        window.hidesOnDeactivate = false
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
    }

    /// `width` × `height` points, centred on the notch, its top on the screen's top edge (the pill opens downward).
    static func place(_ window: NSWindow, width: CGFloat, height: CGFloat) {
        guard let screen = mainScreen else { return }
        let notch = notchFrame(on: screen).frame
        let frame = CGRect(x: notch.midX - width / 2, y: screen.frame.maxY - height, width: width, height: height)
        window.setFrame(frame, display: true)
        window.orderFrontRegardless()
    }
}

/// The pill opens on hover even while another app is in front, as SwiftUI's `.onHover` does in the Swift app. A web
/// view only tracks the mouse in the key window, so this tracking area (always active) tells the page instead: a
/// `ll-pill-hover` event with `detail` true on entering and false on leaving, and passes the moves on to the web view.
final class PillHoverTracker: NSResponder {
    weak var view: NSView?
    var area: NSTrackingArea?

    init(view: NSView) {
        self.view = view
        super.init()
        let area = NSTrackingArea(
            rect: .zero, options: [.activeAlways, .mouseEnteredAndExited, .mouseMoved, .inVisibleRect],
            owner: self, userInfo: nil)
        view.addTrackingArea(area)
        self.area = area
    }

    required init?(coder: NSCoder) { nil }

    private var webView: WKWebView? {
        func find(_ view: NSView) -> WKWebView? {
            if let web = view as? WKWebView { return web }
            for sub in view.subviews { if let web = find(sub) { return web } }
            return nil
        }
        return view.flatMap(find)
    }

    private func tell(_ inside: Bool) {
        webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('ll-pill-hover', {detail: \(inside)}))", completionHandler: nil)
    }

    override func mouseEntered(with event: NSEvent) { tell(true) }
    override func mouseExited(with event: NSEvent) { tell(false) }
    override func mouseMoved(with event: NSEvent) { webView?.mouseMoved(with: event) }

    static var trackers: [ObjectIdentifier: PillHoverTracker] = [:]

    static func attach(to window: NSWindow) {
        guard let view = window.contentView, trackers[ObjectIdentifier(window)] == nil else { return }
        trackers[ObjectIdentifier(window)] = PillHoverTracker(view: view)
    }
}

// MARK: C boundary

/// `{width, height, real}` in points: the notch of the main screen, or the gap the pill takes without one.
@_cdecl("ll_notch_metrics")
public func llNotchMetrics() -> UnsafeMutablePointer<CChar>? {
    var metrics: [String: Any]?
    let read = {
        guard let screen = NotchPill.mainScreen else { return }
        let notch = NotchPill.notchFrame(on: screen)
        metrics = ["width": Double(notch.frame.width), "height": Double(notch.frame.height), "real": notch.real]
    }
    if Thread.isMainThread { read() } else { DispatchQueue.main.sync(execute: read) }
    return jsonString(metrics)
}

@_cdecl("ll_configure_pill")
public func llConfigurePill(_ window: UnsafeMutableRawPointer?) {
    guard let window else { return }
    let nsWindow = Unmanaged<NSWindow>.fromOpaque(window).takeUnretainedValue()
    onMain {
        NotchPill.configure(nsWindow)
        PillHoverTracker.attach(to: nsWindow)
    }
}

@_cdecl("ll_place_pill")
public func llPlacePill(_ window: UnsafeMutableRawPointer?, _ width: Double, _ height: Double) {
    guard let window else { return }
    let nsWindow = Unmanaged<NSWindow>.fromOpaque(window).takeUnretainedValue()
    onMain { NotchPill.place(nsWindow, width: width, height: height) }
}
