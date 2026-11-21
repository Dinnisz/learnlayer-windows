// The C boundary to Rust (`src-tauri/src/platform/macos/native.rs`). Only C types cross it: numbers, booleans,
// pointers, and text as a UTF-8 JSON string made with `strdup` that Rust gives back to `ll_free`.

import AppKit
import ApplicationServices
import Foundation

/// `nil` stays `nil`; anything else becomes a JSON string Rust owns until it calls `ll_free`.
func jsonString(_ value: Any?) -> UnsafeMutablePointer<CChar>? {
    guard let value, JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value),
          let text = String(data: data, encoding: .utf8)
    else { return nil }
    return strdup(text)
}

/// A rectangle in global pixels (top-left origin), as the interface reads every frame: points times `scale`.
func pixelRect(_ rect: CGRect, scale: Double) -> [String: Double] {
    [
        "x": Double(rect.minX) * scale, "y": Double(rect.minY) * scale,
        "width": Double(rect.width) * scale, "height": Double(rect.height) * scale,
    ]
}

@_cdecl("ll_free")
public func llFree(_ pointer: UnsafeMutableRawPointer?) {
    free(pointer)
}

// MARK: Permissions

/// Accessibility (⌥-click needs it to see clicks and read other apps). With `prompt`, the system's own dialog
/// leading to System Settings › Privacy & Security › Accessibility, as `AccessibilityReader.requestTrust`.
@_cdecl("ll_accessibility_trusted")
public func llAccessibilityTrusted(_ prompt: Bool) -> Bool {
    if prompt {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }
    return AXIsProcessTrusted()
}

/// Screen Recording (a window's picture for the OCR). With `request`, the system's prompt (`ScreenGrab.requestAccess`).
@_cdecl("ll_screen_capture_allowed")
public func llScreenCaptureAllowed(_ request: Bool) -> Bool {
    if CGPreflightScreenCaptureAccess() { return true }
    return request ? CGRequestScreenCaptureAccess() : false
}

// MARK: Windows of this app

/// The window server's number of one of this app's windows (an `NSWindow*` from Tauri).
@_cdecl("ll_window_number")
public func llWindowNumber(_ window: UnsafeMutableRawPointer?) -> Int {
    guard let window else { return 0 }
    let nsWindow = Unmanaged<NSWindow>.fromOpaque(window).takeUnretainedValue()
    return nsWindow.windowNumber
}

/// The stage over another app (`AnywhereController.makePanel`): above ordinary windows, on every Space and over a
/// full-screen app, and not hidden when another app is active.
@_cdecl("ll_configure_overlay")
public func llConfigureOverlay(_ window: UnsafeMutableRawPointer?) {
    guard let window else { return }
    let nsWindow = Unmanaged<NSWindow>.fromOpaque(window).takeUnretainedValue()
    onMain {
        nsWindow.level = .floating
        nsWindow.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        nsWindow.hidesOnDeactivate = false
        nsWindow.hasShadow = false
        nsWindow.isOpaque = false
        nsWindow.backgroundColor = .clear
    }
}

/// Runs `work` on the main thread: now when already there, else queued (never waited for: the main thread may be
/// waiting on the caller).
func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
}

/// Gives the keyboard back to app `pid` (the one the stage was opened over).
@_cdecl("ll_activate_pid")
public func llActivatePID(_ pid: Int32) {
    onMain {
        NSRunningApplication(processIdentifier: pid)?.activate(options: [])
    }
}
