// Port of `ScreenGrab` in LearnLayer/Anywhere/AnywhereController.swift @ e0af40f and `QuestionLocator.readLines` in
// LearnLayer/Anywhere/QuestionRegion.swift @ e0af40f: the window under a click, its picture (through
// `screencapture -l`, as the Swift app takes it: no deprecated API, the window's own pixels without the stage over
// it), and its text lines read on the Mac with Vision. Pictures go to Rust as BGRA, 4 bytes a pixel, as on Windows.

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import Vision

enum ScreenGrab {
    /// The ordinary window (layer 0) under `point` that isn't LearnLayer's: its number, frame (points), owner and
    /// title.
    static func window(at point: CGPoint) -> [String: Any]? {
        let own = ProcessInfo.processInfo.processIdentifier
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
        for info in list {
            guard (info[kCGWindowLayer as String] as? Int) == 0,
                  let pid = info[kCGWindowOwnerPID as String] as? Int32, pid != own,
                  let number = info[kCGWindowNumber as String] as? Int,
                  let bounds = info[kCGWindowBounds as String] as? [String: CGFloat],
                  (info[kCGWindowAlpha as String] as? Double ?? 1) > 0.01
            else { continue }
            let frame = CGRect(x: bounds["X"] ?? 0, y: bounds["Y"] ?? 0, width: bounds["Width"] ?? 0, height: bounds["Height"] ?? 0)
            guard frame.contains(point) else { continue }
            let app = NSRunningApplication(processIdentifier: pid)
            return [
                "number": number, "pid": Int(pid),
                "appName": app?.localizedName ?? (info[kCGWindowOwnerName as String] as? String ?? ""),
                "bundleId": app?.bundleIdentifier ?? "",
                "title": info[kCGWindowName as String] as? String ?? "",
                "x": Double(frame.minX), "y": Double(frame.minY), "width": Double(frame.width), "height": Double(frame.height),
            ]
        }
        return nil
    }

    /// The app in front (not LearnLayer): its name, bundle and pid.
    static func frontApp() -> [String: Any]? {
        guard let front = NSWorkspace.shared.frontmostApplication else { return nil }
        return ["appName": front.localizedName ?? "", "bundleId": front.bundleIdentifier ?? "", "pid": Int(front.processIdentifier)]
    }

    /// A picture of window `number` (PNG, so the page's edges and thin lines stay exact), or nil without Screen
    /// Recording.
    static func windowPicture(_ number: Int) -> CGImage? {
        capture(["-l\(number)", "-x", "-o"])
    }

    /// A picture of a part of the screen (global points).
    static func screenPicture(_ rect: CGRect) -> CGImage? {
        capture(["-x", "-R\(Int(rect.minX)),\(Int(rect.minY)),\(Int(rect.width)),\(Int(rect.height))"])
    }

    private static func capture(_ arguments: [String]) -> CGImage? {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("LearnLayer-window-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: file) }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = arguments + ["-t", "png", file.path]
        do { try process.run() } catch { return nil }
        process.waitUntilExit()
        // Its bytes and pixels taken now: the file is deleted right after.
        guard let data = try? Data(contentsOf: file),
              let source = CGImageSourceCreateWithData(data as CFData, nil)
        else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }

    /// The picture's pixels, BGRA (blue first, alpha last), on white where it is see-through.
    static func bgra(_ image: CGImage) -> (width: Int, height: Int, bytes: [UInt8])? {
        let width = image.width, height = image.height
        guard width > 0, height > 0 else { return nil }
        var bytes = [UInt8](repeating: 255, count: width * height * 4)
        let info = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info
            ) else { return false }
            context.setFillColor(CGColor(gray: 1, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? (width, height, bytes) : nil
    }

    /// The text lines Vision reads in BGRA pixels, rects in pixels from the picture's top-left
    /// (`QuestionLocator.readLines`, accurate, Portuguese of Portugal first).
    static func lines(bgra: UnsafePointer<UInt8>, width: Int, height: Int) -> [[String: Any]] {
        guard width > 0, height > 0 else { return [] }
        let data = Data(bytes: bgra, count: width * height * 4) as CFData
        let info = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        guard let provider = CGDataProvider(data: data),
              let image = CGImage(
                width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: info), provider: provider,
                decode: nil, shouldInterpolate: false, intent: .defaultIntent
              )
        else { return [] }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["pt-PT", "en-US"]
        request.usesLanguageCorrection = true
        try? VNImageRequestHandler(cgImage: image).perform([request])
        let size = CGSize(width: width, height: height)
        let found: [(text: String, rect: CGRect)] = (request.results ?? []).compactMap { observation in
            guard let text = observation.topCandidates(1).first?.string else { return nil }
            let box = observation.boundingBox
            let rect = CGRect(
                x: box.minX * size.width, y: (1 - box.maxY) * size.height,
                width: box.width * size.width, height: box.height * size.height
            )
            return (text, rect)
        }
        return found.map { line in
            ["text": line.text, "rect": ["x": Double(line.rect.minX), "y": Double(line.rect.minY), "width": Double(line.rect.width), "height": Double(line.rect.height)]]
        }
    }
}

// MARK: C boundary

@_cdecl("ll_window_at")
public func llWindowAt(_ x: Double, _ y: Double) -> UnsafeMutablePointer<CChar>? {
    jsonString(ScreenGrab.window(at: CGPoint(x: x, y: y)))
}

@_cdecl("ll_front_app")
public func llFrontApp() -> UnsafeMutablePointer<CChar>? {
    jsonString(ScreenGrab.frontApp())
}

/// A picture as BGRA bytes made with `malloc` (Rust copies them and gives them back to `ll_free`).
private func picturePointer(
    _ image: CGImage?, _ width: UnsafeMutablePointer<Int>?, _ height: UnsafeMutablePointer<Int>?
) -> UnsafeMutablePointer<UInt8>? {
    guard let image, let pixels = ScreenGrab.bgra(image), let width, let height else { return nil }
    guard let raw = malloc(pixels.bytes.count) else { return nil }
    let buffer = raw.bindMemory(to: UInt8.self, capacity: pixels.bytes.count)
    buffer.initialize(from: pixels.bytes, count: pixels.bytes.count)
    width.pointee = pixels.width
    height.pointee = pixels.height
    return buffer
}

@_cdecl("ll_window_picture")
public func llWindowPicture(
    _ number: Int, _ width: UnsafeMutablePointer<Int>?, _ height: UnsafeMutablePointer<Int>?
) -> UnsafeMutablePointer<UInt8>? {
    picturePointer(ScreenGrab.windowPicture(number), width, height)
}

@_cdecl("ll_screen_picture")
public func llScreenPicture(
    _ x: Double, _ y: Double, _ w: Double, _ h: Double,
    _ width: UnsafeMutablePointer<Int>?, _ height: UnsafeMutablePointer<Int>?
) -> UnsafeMutablePointer<UInt8>? {
    picturePointer(ScreenGrab.screenPicture(CGRect(x: x, y: y, width: w, height: h)), width, height)
}

@_cdecl("ll_ocr_lines")
public func llOCRLines(_ bgra: UnsafePointer<UInt8>?, _ width: Int, _ height: Int) -> UnsafeMutablePointer<CChar>? {
    guard let bgra else { return jsonString([] as [Any]) }
    return jsonString(ScreenGrab.lines(bgra: bgra, width: width, height: height))
}
