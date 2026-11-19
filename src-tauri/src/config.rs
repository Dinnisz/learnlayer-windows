//! Where the API and the site are. The same rules as `core/ai/aiGateway.ts`
//! (port of LearnLayer/AI/AIGateway.swift @ ref 2026-11-04), kept here too because the session
//! refresh happens on the native side.
//!
//! Values come from the process environment first, then from `config.json` in the app's data folder
//! (`{"LEARNLAYER_API_BASE": "…", "LEARNLAYER_SITE_BASE": "…"}`), then the production defaults.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;
use url::Url;

use crate::platform;

pub const PRODUCTION_BASE: &str = "https://api.learnlayer.app";
pub const PRODUCTION_SITE: &str = "https://learnlayer.app";
pub const API_BASE_KEY: &str = "LEARNLAYER_API_BASE";
pub const SITE_BASE_KEY: &str = "LEARNLAYER_SITE_BASE";
pub const USE_LOCAL_KEY: &str = "LEARNLAYER_USE_LOCAL_KEY";

/// Plain http is only for a local `wrangler dev`. Release builds refuse it, so a stray
/// LEARNLAYER_API_BASE can't send tokens and questions unencrypted.
pub const ALLOWS_INSECURE_API_BASE: bool = cfg!(debug_assertions);

pub type Environment = HashMap<String, String>;

/// The app's data folder, wherever the operating system keeps it.
pub fn data_dir() -> PathBuf {
    platform::current().data_dir()
}

/// An absolute http(s) URL with a host, as written; `None` for anything else.
fn absolute_http(raw: Option<&String>) -> Option<String> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    let url = Url::parse(trimmed).ok()?;
    let scheme_ok = url.scheme() == "https" || url.scheme() == "http";
    let has_host = url.host_str().is_some_and(|host| !host.is_empty());
    (scheme_ok && has_host).then(|| trimmed.to_string())
}

pub fn base_url(environment: &Environment, allow_insecure: bool) -> String {
    let url = absolute_http(environment.get(API_BASE_KEY)).unwrap_or_else(|| PRODUCTION_BASE.to_string());
    if !allow_insecure && !url.to_ascii_lowercase().starts_with("https://") {
        return PRODUCTION_BASE.to_string();
    }
    url
}

/// The marketing site. Login, account and checkout live there, not in the app.
pub fn site_base(environment: &Environment) -> String {
    absolute_http(environment.get(SITE_BASE_KEY)).unwrap_or_else(|| PRODUCTION_SITE.to_string())
}

pub fn endpoint(path: &str, base: &str) -> String {
    let Ok(url) = Url::parse(base) else {
        return format!("{base}{path}");
    };
    let prefix = url.path().strip_suffix('/').unwrap_or(url.path());
    format!("{}{}{}", url.origin().ascii_serialization(), prefix, path)
}

/// The settings file, when it exists and is a flat JSON object of strings.
fn file_values(path: &PathBuf) -> Environment {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Environment::new();
    };
    parse_file_values(&text)
}

/// `config.json`'s keys. Notepad and Windows PowerShell save UTF-8 with a byte-order mark, which JSON doesn't allow:
/// it is skipped, or the whole file would be ignored and the app would fall back to production without a word.
fn parse_file_values(text: &str) -> Environment {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(text) else {
        return Environment::new();
    };
    map.into_iter()
        .filter_map(|(key, value)| value.as_str().map(|text| (key, text.to_string())))
        .collect()
}

/// The file first, then the process environment on top of it.
pub fn merged_environment(file: Environment, process: impl Iterator<Item = (String, String)>) -> Environment {
    let mut merged = file;
    for (key, value) in process {
        if key.starts_with("LEARNLAYER_") {
            merged.insert(key, value);
        }
    }
    merged
}

pub fn current_environment() -> Environment {
    merged_environment(file_values(&data_dir().join("config.json")), std::env::vars())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub api_base: String,
    pub site_base: String,
    pub debug: bool,
    pub version: String,
    /// "windows" or "macos": the interface picks its wording, shortcuts and glyphs from this.
    pub platform: String,
    /// For the device name the API shows in Account › Devices ("Windows · DESKTOP-ABC").
    pub computer_name: String,
    /// The `LEARNLAYER_*` values in effect, for the pure routing rules in `core/`.
    pub environment: Environment,
}

impl AppConfig {
    pub fn from_environment(environment: Environment, debug: bool) -> Self {
        AppConfig {
            api_base: base_url(&environment, debug),
            site_base: site_base(&environment),
            debug,
            version: env!("CARGO_PKG_VERSION").to_string(),
            platform: platform::current().name().to_string(),
            computer_name: platform::current().computer_name(),
            environment,
        }
    }

    pub fn current() -> Self {
        Self::from_environment(current_environment(), ALLOWS_INSECURE_API_BASE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> Environment {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    // Port of AIGatewayTests in LearnLayerTests/BackendClientTests.swift.

    #[test]
    fn site_base_stays_configurable() {
        assert_eq!(site_base(&env(&[])), PRODUCTION_SITE);
        assert_eq!(site_base(&env(&[(SITE_BASE_KEY, "not a url")])), PRODUCTION_SITE);
        assert_eq!(
            site_base(&env(&[(SITE_BASE_KEY, "http://127.0.0.1:8787")])),
            "http://127.0.0.1:8787"
        );
    }

    #[test]
    fn base_url_and_endpoint() {
        assert_eq!(base_url(&env(&[]), true), PRODUCTION_BASE);
        assert_eq!(base_url(&env(&[(API_BASE_KEY, "not a url")]), true), PRODUCTION_BASE);
        assert_eq!(
            base_url(&env(&[(API_BASE_KEY, "ftp://files.example")]), true),
            PRODUCTION_BASE
        );
        let local = base_url(&env(&[(API_BASE_KEY, "http://127.0.0.1:8787")]), true);
        assert_eq!(local, "http://127.0.0.1:8787");
        assert_eq!(endpoint("/v1/plans", &local), "http://127.0.0.1:8787/v1/plans");
        assert_eq!(
            endpoint("/v1/me", "https://example.com/api/"),
            "https://example.com/api/v1/me"
        );
    }

    #[test]
    fn release_builds_refuse_a_plain_http_base() {
        let local = env(&[(API_BASE_KEY, "http://127.0.0.1:8787")]);
        assert_eq!(base_url(&local, false), PRODUCTION_BASE);
        assert_eq!(base_url(&local, true), "http://127.0.0.1:8787");
        let secure = env(&[(API_BASE_KEY, "https://staging.example.com")]);
        assert_eq!(base_url(&secure, false), "https://staging.example.com");
    }

    #[test]
    fn a_config_file_saved_with_a_byte_order_mark_is_read() {
        let text = "\u{feff}{\"LEARNLAYER_SITE_BASE\": \"https://site-file.example\"}";
        assert_eq!(
            parse_file_values(text).get(SITE_BASE_KEY).map(String::as_str),
            Some("https://site-file.example")
        );
        assert!(parse_file_values("not json").is_empty());
    }

    #[test]
    fn the_process_environment_wins_over_the_file() {
        let file = env(&[
            (API_BASE_KEY, "https://from-file.example"),
            (SITE_BASE_KEY, "https://site-file.example"),
        ]);
        let process = vec![
            (API_BASE_KEY.to_string(), "https://from-env.example".to_string()),
            ("PATH".to_string(), "C:\\Windows".to_string()),
        ];
        let merged = merged_environment(file, process.into_iter());
        assert_eq!(
            merged.get(API_BASE_KEY).map(String::as_str),
            Some("https://from-env.example")
        );
        assert_eq!(
            merged.get(SITE_BASE_KEY).map(String::as_str),
            Some("https://site-file.example")
        );
        assert!(!merged.contains_key("PATH"));
    }

    #[test]
    fn the_config_the_interface_reads() {
        let config = AppConfig::from_environment(env(&[(API_BASE_KEY, "http://127.0.0.1:8787")]), false);
        assert_eq!(config.api_base, PRODUCTION_BASE);
        assert_eq!(config.site_base, PRODUCTION_SITE);
        assert!(!config.debug);
        let json = serde_json::to_value(&config).unwrap();
        assert!(json.get("apiBase").is_some() && json.get("siteBase").is_some());
    }
}
