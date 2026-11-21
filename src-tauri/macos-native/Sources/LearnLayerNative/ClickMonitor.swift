// Port of LearnLayer/Anywhere/ClickMonitor.swift @ e0af40f, with the talk chord of LearnLayer/Voice/TalkChord.swift
// @ e0af40f folded into the same tap. What changed: the events go to Rust through one C callback instead of closures
// on the main thread, and which of LearnLayer's windows a click may land on is told by window number from Rust.

import AppKit
import CoreGraphics
import Foundation

/// What the tap reports to Rust (`native.rs` keeps the same numbers).
enum TapEvent: Int32 {
    case optionClick = 1
    case escape = 2
    case talkBegan = 3
    case talkEnded = 4
    /// The fail-safe pulled the tap (permission gone, tap thread stuck, the system kept timing it out).
    case removed = 5
}

public typealias TapCallback = @convention(c) (Int32, Double, Double) -> Void

/// Watches for ⌥-click anywhere on the Mac. That click is kept from the app underneath (no link opens, no text is
/// selected) and handed to LearnLayer; every other click passes straight through. Nothing else is read.
///
/// The tap runs on its own thread, never the main one: a session event tap holds every click and key press on the
/// Mac until it answers, so a busy main thread would freeze the whole computer's input. The callback only reads
/// values kept under a lock, and Rust's callback only queues the event.
final class ClickMonitor: @unchecked Sendable {
    static let shared = ClickMonitor()

    var callback: TapCallback?

    private let lock = NSLock()
    private var _enabled = true
    private var _interceptsEscape = false
    private var _talkEnabled = true
    /// LearnLayer's windows a click goes through (the stage while it lets clicks through): not "our own".
    private var _seeThrough: Set<Int> = []
    private var health = TapHealth()
    private var watchdog: Timer?
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var tapRunLoop: CFRunLoop?
    /// The ⌥-click's mouse-up must be kept from the app too (tap thread only). Expires so a lost mouse-up can never
    /// leave clicks being eaten.
    fileprivate var swallowsMouseUpUntil: TimeInterval = 0
    fileprivate let talk = TalkChordTracker()

    var enabled: Bool {
        get { lock.withLock { _enabled } }
        set { lock.withLock { _enabled = newValue } }
    }
    var interceptsEscape: Bool {
        get { lock.withLock { _interceptsEscape } }
        set { lock.withLock { _interceptsEscape = newValue } }
    }
    var talkEnabled: Bool {
        get { lock.withLock { _talkEnabled } }
        set { lock.withLock { _talkEnabled = newValue } }
    }
    var seeThrough: Set<Int> {
        get { lock.withLock { _seeThrough } }
        set { lock.withLock { _seeThrough = newValue } }
    }

    func send(_ event: TapEvent, _ point: CGPoint = .zero) {
        callback?(event.rawValue, Double(point.x), Double(point.y))
    }

    /// Whether one of LearnLayer's own windows (not a see-through one) is what a click at `point` would hit.
    func landsOnOwnWindow(_ point: CGPoint) -> Bool {
        OwnWindowHit.isOwn(point, frontToBack: OwnWindowHit.onScreenWindows(), ownPID: getpid(), seeThrough: seeThrough)
    }

    /// 0: running. 1: Accessibility isn't granted (no tap may be installed then: it could hold the Mac's input).
    /// 2: the system refused the tap.
    func start() -> Int32 {
        if tap != nil { return 0 }
        guard AXIsProcessTrusted() else { return 1 }
        let mask = (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.leftMouseUp.rawValue)
            | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.flagsChanged.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: CGEventMask(mask), callback: clickCallback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else { return 2 }
        self.tap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        self.source = source
        let ready = DispatchSemaphore(value: 0)
        let thread = Thread { [weak self] in
            let loop = CFRunLoopGetCurrent()
            self?.tapRunLoop = loop
            CFRunLoopAddSource(loop, source, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)
            ready.signal()
            CFRunLoopRun()
        }
        thread.name = "LearnLayer.ClickMonitor"
        thread.qualityOfService = .userInteractive
        thread.start()
        guard ready.wait(timeout: .now() + 2) == .success else {
            stop()
            return 2
        }
        lock.withLock { health = TapHealth(lastBeat: ProcessInfo.processInfo.systemUptime) }
        DispatchQueue.main.async { self.startWatchdog() }
        return 0
    }

    func stop() {
        DispatchQueue.main.async { [weak self] in
            self?.watchdog?.invalidate()
            self?.watchdog = nil
        }
        if let tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let source, let tapRunLoop {
            CFRunLoopRemoveSource(tapRunLoop, source, .commonModes)
            CFRunLoopStop(tapRunLoop)
        }
        tap = nil
        source = nil
        tapRunLoop = nil
        talk.update(held: false, report: { [weak self] in self?.send($0) })
    }

    /// The system turned the tap off (it answered too slowly, or the secure-input keys): on again, unless it keeps
    /// happening; then it stays off for the watchdog to clean up.
    fileprivate func tapWasDisabled() {
        let now = ProcessInfo.processInfo.systemUptime
        let keepOff = lock.withLock { () -> Bool in
            health.noteTimeout(at: now)
            return health.tooManyTimeouts(at: now)
        }
        if keepOff || !AXIsProcessTrusted() {
            DispatchQueue.main.async { [weak self] in self?.check() }
            return
        }
        if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
    }

    /// Twice a second on the main thread: the permission is still there, the tap thread still answers, the system
    /// isn't fighting the tap. Otherwise the tap goes, so input can never stay held.
    private func startWatchdog() {
        watchdog?.invalidate()
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.check() }
        RunLoop.main.add(timer, forMode: .common)
        watchdog = timer
    }

    private func check() {
        guard tap != nil else { return }
        if let loop = tapRunLoop {
            CFRunLoopPerformBlock(loop, CFRunLoopMode.commonModes.rawValue) { [weak self] in
                guard let self else { return }
                let now = ProcessInfo.processInfo.systemUptime
                self.lock.withLock { self.health.lastBeat = now }
            }
            CFRunLoopWakeUp(loop)
        }
        let now = ProcessInfo.processInfo.systemUptime
        let trusted = AXIsProcessTrusted()
        let verdict = lock.withLock { health.verdict(at: now, trusted: trusted) }
        guard verdict != .healthy else { return }
        stop()
        send(.removed)
    }
}

/// Kept tiny: the system disables a tap that answers slowly.
private func clickCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, userInfo: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    guard let userInfo else { return Unmanaged.passUnretained(event) }
    let monitor = Unmanaged<ClickMonitor>.fromOpaque(userInfo).takeUnretainedValue()
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
        monitor.tapWasDisabled()
    case .leftMouseDown:
        let flags = event.flags
        guard flags.contains(.maskAlternate), monitor.enabled else { break }
        let point = event.location
        if flags.contains(.maskCommand) || flags.contains(.maskControl) || flags.contains(.maskShift) { break }
        if monitor.landsOnOwnWindow(point) { break }
        monitor.swallowsMouseUpUntil = ProcessInfo.processInfo.systemUptime + 2
        monitor.send(.optionClick, point)
        return nil
    case .keyDown:
        if event.getIntegerValueField(.keyboardEventKeycode) == 53, monitor.interceptsEscape {
            monitor.send(.escape)
            return nil
        }
    case .leftMouseUp:
        if monitor.swallowsMouseUpUntil > 0 {
            let swallow = ProcessInfo.processInfo.systemUptime < monitor.swallowsMouseUpUntil
            monitor.swallowsMouseUpUntil = 0
            if swallow { return nil }
        }
    case .flagsChanged:
        if monitor.talkEnabled {
            let held = TalkChord.isHeld(event.flags)
            monitor.talk.update(held: held, report: { monitor.send($0) })
        }
    default:
        break
    }
    return Unmanaged.passUnretained(event)
}

/// The global talk key: Control + Option held together. Option alone stays the ⌥-click key.
enum TalkChord {
    /// A brief Option on the way to an ⌥-click must never open the microphone.
    static let holdDelay: TimeInterval = 0.12

    static func isHeld(control: Bool, option: Bool, command: Bool, shift: Bool) -> Bool {
        control && option && !command && !shift
    }

    static func isHeld(_ flags: CGEventFlags) -> Bool {
        isHeld(
            control: flags.contains(.maskControl), option: flags.contains(.maskAlternate),
            command: flags.contains(.maskCommand), shift: flags.contains(.maskShift)
        )
    }
}

/// Turns raw "is the chord down" readings into one begin and one end, after the hold delay (`TalkChordTracker`).
final class TalkChordTracker: @unchecked Sendable {
    private let queue = DispatchQueue(label: "LearnLayer.TalkChord")
    private var isActive = false
    private var pending: DispatchWorkItem?

    func update(held: Bool, report: @escaping (TapEvent) -> Void) {
        queue.async { [self] in
            if held {
                guard !isActive, pending == nil else { return }
                let item = DispatchWorkItem { [self] in
                    pending = nil
                    isActive = true
                    report(.talkBegan)
                }
                pending = item
                queue.asyncAfter(deadline: .now() + TalkChord.holdDelay, execute: item)
            } else {
                pending?.cancel()
                pending = nil
                if isActive {
                    isActive = false
                    report(.talkEnded)
                }
            }
        }
    }
}

/// Which window a click would hit, from the window server's front-to-back list.
enum OwnWindowHit {
    struct Entry: Equatable {
        var number: Int
        var pid: Int32
        var frame: CGRect
        var alpha: Double
    }

    /// The topmost window under `point` decides. LearnLayer's windows in `seeThrough` (the stage letting clicks
    /// through) are skipped, as are invisible windows.
    static func isOwn(_ point: CGPoint, frontToBack: [Entry], ownPID: Int32, seeThrough: Set<Int>) -> Bool {
        for entry in frontToBack where entry.alpha > 0.01 && entry.frame.contains(point) {
            if entry.pid == ownPID {
                if seeThrough.contains(entry.number) { continue }
                return true
            }
            return false
        }
        return false
    }

    static func onScreenWindows() -> [Entry] {
        let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
        return list.compactMap { info in
            guard let number = info[kCGWindowNumber as String] as? Int,
                  let pid = info[kCGWindowOwnerPID as String] as? Int32,
                  let bounds = info[kCGWindowBounds as String] as? [String: CGFloat],
                  let frame = CGRect(dictionaryRepresentation: bounds as CFDictionary) else { return nil }
            return Entry(number: number, pid: pid, frame: frame, alpha: info[kCGWindowAlpha as String] as? Double ?? 1)
        }
    }
}

/// The fail-safe's bookkeeping.
struct TapHealth: Equatable {
    enum Verdict: Equatable { case healthy, lostPermission, unresponsive, keptTimingOut }
    var lastBeat: TimeInterval = 0
    var timeouts: [TimeInterval] = []
    static let staleAfter: TimeInterval = 3
    static let timeoutWindow: TimeInterval = 10
    static let maxTimeouts = 3

    mutating func noteTimeout(at now: TimeInterval) {
        timeouts = timeouts.filter { now - $0 < Self.timeoutWindow } + [now]
    }
    func tooManyTimeouts(at now: TimeInterval) -> Bool {
        timeouts.filter { now - $0 < Self.timeoutWindow }.count >= Self.maxTimeouts
    }
    func verdict(at now: TimeInterval, trusted: Bool) -> Verdict {
        if !trusted { return .lostPermission }
        if tooManyTimeouts(at: now) { return .keptTimingOut }
        if now - lastBeat > Self.staleAfter { return .unresponsive }
        return .healthy
    }
}

// MARK: C boundary

@_cdecl("ll_tap_start")
public func llTapStart(_ callback: TapCallback?) -> Int32 {
    ClickMonitor.shared.callback = callback
    return ClickMonitor.shared.start()
}

@_cdecl("ll_tap_stop")
public func llTapStop() {
    ClickMonitor.shared.stop()
}

@_cdecl("ll_tap_running")
public func llTapRunning() -> Bool {
    ClickMonitor.shared.isRunning
}

@_cdecl("ll_tap_set_enabled")
public func llTapSetEnabled(_ enabled: Bool) {
    ClickMonitor.shared.enabled = enabled
}

@_cdecl("ll_tap_set_intercepts_escape")
public func llTapSetInterceptsEscape(_ intercepts: Bool) {
    ClickMonitor.shared.interceptsEscape = intercepts
}

@_cdecl("ll_tap_set_talk_enabled")
public func llTapSetTalkEnabled(_ enabled: Bool) {
    ClickMonitor.shared.talkEnabled = enabled
}

/// The window (by number) a click goes through, or 0 for none.
@_cdecl("ll_tap_set_see_through")
public func llTapSetSeeThrough(_ number: Int) {
    ClickMonitor.shared.seeThrough = number == 0 ? [] : [number]
}

extension ClickMonitor {
    var isRunning: Bool { tap != nil }
}
