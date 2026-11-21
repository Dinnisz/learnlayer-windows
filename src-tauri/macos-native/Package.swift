// swift-tools-version:5.9
// The Mac's native side of the shared app: the Swift app's ⌥-click, Accessibility reading, window pictures, Vision OCR,
// notch pill and talk key, kept as close to their Swift originals as the C boundary allows. Built and linked by
// `src-tauri/build.rs` through swift-rs on macOS only; Windows never sees this folder.

import PackageDescription

let package = Package(
    name: "LearnLayerNative",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "LearnLayerNative", type: .static, targets: ["LearnLayerNative"]),
    ],
    targets: [
        .target(name: "LearnLayerNative", path: "Sources/LearnLayerNative"),
    ]
)
