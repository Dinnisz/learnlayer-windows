//! The native side of LearnLayer: small commands for the interface. Whatever depends on the operating
//! system is in platform/, behind the Platform trait.

mod api;
pub mod config;
pub mod data_files;
mod platform;
pub mod session;
mod tray;
mod updates;

use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;

use config::AppConfig;
use session::{AuthTokens, Handoff, ProfileFile, SecretStore, Session, SessionStatus};

const MAIN: &str = "main";
/// What Windows passes when it starts LearnLayer at sign-in: then only the pill and the tray icon appear.
const AUTOSTART_FLAG: &str = "--autostart";

struct AppState {
    config: AppConfig,
    http: reqwest::Client,
    session: Session<Box<dyn SecretStore>, ProfileFile>,
}

impl AppState {
    fn new() -> Self {
        AppState {
            config: AppConfig::current(),
            http: api::client(),
            session: Session::new(
                platform::current().secret_store(),
                ProfileFile(config::data_dir().join("account.json")),
            ),
        }
    }
}

/// Shows the LearnLayer window and, when a section is named, tells the interface to open it.
pub(crate) fn show_main_window(app: &AppHandle, route: Option<&str>) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    if let Some(route) = route {
        let _ = app.emit_to(MAIN, "navigate", route);
    }
}

// MARK: Commands

/// Where the API and the site are, and whether this is a debug build. The interface asks once at start.
#[tauri::command]
fn app_config(state: State<'_, AppState>) -> AppConfig {
    state.config.clone()
}

#[tauri::command]
fn show_main(app: AppHandle, route: Option<String>) {
    show_main_window(&app, route.as_deref());
}

#[tauri::command]
fn session_status(state: State<'_, AppState>) -> SessionStatus {
    state.session.status()
}

#[tauri::command]
async fn session_access_token(state: State<'_, AppState>, force: bool) -> Result<Option<String>, ()> {
    let token = state
        .session
        .access_token(force, |refresh_token| {
            api::refresh(&state.http, &state.config.api_base, refresh_token)
        })
        .await;
    Ok(token)
}

#[tauri::command]
fn session_save(state: State<'_, AppState>, tokens: AuthTokens) -> bool {
    state.session.save(&tokens)
}

#[tauri::command]
async fn session_sign_out(state: State<'_, AppState>) -> Result<(), ()> {
    if let Some(tokens) = state.session.load() {
        api::logout(
            &state.http,
            &state.config.api_base,
            &tokens.access_token,
            &tokens.refresh_token,
        )
        .await;
    }
    state.session.clear();
    Ok(())
}

#[tauri::command]
fn session_clear(state: State<'_, AppState>) {
    state.session.clear();
}

#[tauri::command]
fn session_remember_user_id(state: State<'_, AppState>, id: String) {
    state.session.remember_user_id(&id);
}

#[tauri::command]
fn session_save_handoff(app_state: State<'_, AppState>, verifier: String, state: String) -> bool {
    app_state.session.save_handoff(&verifier, &state)
}

#[tauri::command]
fn session_load_handoff(state: State<'_, AppState>) -> Option<Handoff> {
    state.session.load_handoff()
}

#[tauri::command]
fn session_clear_handoff(state: State<'_, AppState>) {
    state.session.clear_handoff();
}

/// The memory-sync keys of one account (`device.<user>`, `memory.<user>`), base64, in the system's secret store
/// under `memory-sync.<name>` (the Mac keeps them in the Keychain). Only these names: the page can never reach the
/// session tokens through here.
fn memory_secret_account(name: &str) -> Option<String> {
    let allowed = (name.starts_with("device.") || name.starts_with("memory."))
        && name.len() <= 120
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    allowed.then(|| format!("memory-sync.{name}"))
}

#[tauri::command]
fn memory_secret_read(name: String) -> Option<String> {
    let account = memory_secret_account(&name)?;
    platform::current().secret_store().read(&account)
}

#[tauri::command]
fn memory_secret_write(name: String, value: Option<String>) -> bool {
    let Some(account) = memory_secret_account(&name) else {
        return false;
    };
    let store = platform::current().secret_store();
    match value {
        Some(value) => store.write(&account, &value),
        None => {
            store.delete(&account);
            true
        }
    }
}

/// Asks where to save, then writes the text there. `false` when the student cancelled.
#[tauri::command]
async fn save_text_file(app: AppHandle, default_name: String, contents: String) -> Result<bool, String> {
    let Some(path) = app.dialog().file().set_file_name(default_name).blocking_save_file() else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|error| error.to_string())?;
    std::fs::write(path, contents).map_err(|error| error.to_string())?;
    Ok(true)
}

pub fn run() {
    let context = tauri::generate_context!();
    let updates_on = updates::configured(&context);
    let builder = tauri::Builder::default()
        // First, so a second launch (a click on a `learnlayer://` link) hands its link to this one and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _arguments, _directory| {
            show_main_window(app, None);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        // "Start with Windows" (Settings › General), off until the student turns it on.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ));
    let builder = if updates_on {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    } else {
        builder
    };
    builder
        // The microphone is the app's own (the talk key, the introduction's level bars), and only the app's own pages
        // load here: no browser prompt naming "localhost". Windows' own microphone privacy setting still decides.
        .on_permission_request(|_, kind| match kind {
            tauri::webview::PermissionKind::Microphone => tauri::webview::PermissionResponse::Allow,
            _ => tauri::webview::PermissionResponse::Default,
        })
        .manage(AppState::new())
        .manage(updates::PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            app_config,
            show_main,
            session_status,
            session_access_token,
            session_save,
            session_sign_out,
            session_clear,
            session_remember_user_id,
            session_save_handoff,
            session_load_handoff,
            session_clear_handoff,
            save_text_file,
            memory_secret_read,
            memory_secret_write,
            platform::pill_resize,
            platform::pill_notch,
            platform::anywhere_set_enabled,
            platform::anywhere_picture,
            platform::anywhere_pdf,
            platform::anywhere_close,
            platform::anywhere_interactive,
            platform::anywhere_explain_selection,
            platform::anywhere_capture_area,
            platform::anywhere_capture_text,
            platform::local_openrouter_key,
            platform::talk_key_set,
            tray::set_tray_labels,
            data_files::data_file_read,
            data_files::data_file_write,
            updates::update_install,
            updates::update_ready,
        ])
        .setup(move |app| {
            // The installer registers `learnlayer://`; a debug build registers it for this user itself.
            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            tray::create(app.handle())?;
            platform::current().create_pill(app.handle())?;
            // Alt-click is on until Settings turns it off; if the hooks can't start, the app still runs.
            if let Err(error) = platform::current().start_anywhere(app.handle(), true) {
                eprintln!("Alt-click is unavailable: {error}");
            }
            // The window starts hidden (tauri.conf.json): it shows unless Windows started the app at sign-in.
            if !std::env::args().any(|argument| argument == AUTOSTART_FLAG) {
                show_main_window(app.handle(), None);
            }
            if updates_on {
                updates::start(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the LearnLayer window hides it: the pill and the tray icon keep the app alive.
            if window.label() == MAIN {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(context)
        .expect("error while running LearnLayer");
}
