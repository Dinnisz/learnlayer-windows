fn main() {
    // Tauri's own app manifest (Common Controls v6), embedded by the linker rather than by tauri-build, so the
    // unit-test executable gets it too: without it the tests can't start (STATUS_ENTRYPOINT_NOT_FOUND).
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    let attributes = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attributes).expect("tauri-build failed");

    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    link_mac_native();
}

/// The Swift package in macos-native/ (⌥-click, Accessibility, pictures, Vision, the notch), on macOS only.
#[cfg(target_os = "macos")]
fn link_mac_native() {
    println!("cargo:rerun-if-changed=macos-native/Sources");
    println!("cargo:rerun-if-changed=macos-native/Package.swift");
    swift_rs::SwiftLinker::new("13.0")
        .with_package("LearnLayerNative", "./macos-native/")
        .link();
}

#[cfg(not(target_os = "macos"))]
fn link_mac_native() {}
