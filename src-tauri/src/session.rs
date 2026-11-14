//! Access and refresh tokens for the LearnLayer API.
//! Port of LearnLayer/AI/SessionStore.swift (and its `SessionCoordinator`) @ ref 2026-11-04.
//!
//! The tokens live in the operating system's secret store (the Credential Manager on Windows,
//! `platform/windows/credentials.rs`) under `LearnLayer.Session`, never in a file.
//! Every window asks this one place for the access token, so a rotating refresh token is never
//! spent twice: one refresh at a time, and callers that arrive during it get its result.

use std::future::Future;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

pub const SERVICE: &str = "LearnLayer.Session";
const ACCESS: &str = "access";
const REFRESH: &str = "refresh";
const EXPIRY: &str = "access-expiry";
const VERIFIER: &str = "pkce-verifier";
const STATE: &str = "pkce-state";

/// A forced refresh that arrives this soon after another one reuses its result instead of
/// rotating the token again (two calls that both saw a 401 at the same moment).
const FRESH_FOR: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountUser {
    pub id: String,
    pub email: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub access_expires_at: DateTime<Utc>,
    pub user: AccountUser,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub signed_in: bool,
    pub email: String,
    #[serde(rename = "userID")]
    pub user_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Handoff {
    pub verifier: String,
    pub state: String,
}

/// Where the secrets are kept. The app uses the platform's store; tests use memory.
pub trait SecretStore: Send + Sync {
    fn read(&self, account: &str) -> Option<String>;
    fn write(&self, account: &str, value: &str) -> bool;
    fn delete(&self, account: &str);
}

/// The email and user id shown before `/v1/me` answers (UserDefaults on the Mac). Not secrets.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub user_id: String,
}

pub trait ProfileStore: Send + Sync {
    fn load(&self) -> Profile;
    fn save(&self, profile: &Profile);
}

/// `account.json` in the app's data folder.
pub struct ProfileFile(pub PathBuf);

impl ProfileStore for ProfileFile {
    fn load(&self) -> Profile {
        std::fs::read_to_string(&self.0)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    fn save(&self, profile: &Profile) {
        if let Some(parent) = self.0.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string_pretty(profile) {
            let _ = std::fs::write(&self.0, text);
        }
    }
}

pub fn needs_refresh(expires_at: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    (expires_at - now).num_milliseconds() < 60_000
}

pub struct Session<S: SecretStore, P: ProfileStore> {
    secrets: S,
    profile: P,
    cached: Mutex<Option<AuthTokens>>,
    /// Held for the whole of a refresh, so two calls never rotate the refresh token twice.
    refreshing: tokio::sync::Mutex<Option<Instant>>,
}

impl<S: SecretStore, P: ProfileStore> Session<S, P> {
    pub fn new(secrets: S, profile: P) -> Self {
        Session {
            secrets,
            profile,
            cached: Mutex::new(None),
            refreshing: tokio::sync::Mutex::new(None),
        }
    }

    pub fn has_refresh_token(&self) -> bool {
        self.secrets.read(REFRESH).is_some_and(|token| !token.is_empty())
    }

    pub fn status(&self) -> SessionStatus {
        let profile = self.profile.load();
        let signed_in = self.has_refresh_token();
        SessionStatus {
            signed_in,
            email: if signed_in { profile.email } else { String::new() },
            user_id: if signed_in { profile.user_id } else { String::new() },
        }
    }

    pub fn load(&self) -> Option<AuthTokens> {
        if let Some(tokens) = self.cached.lock().unwrap().clone() {
            return Some(tokens);
        }
        let access = self.secrets.read(ACCESS)?;
        let refresh = self.secrets.read(REFRESH)?;
        let expiry = DateTime::parse_from_rfc3339(&self.secrets.read(EXPIRY)?)
            .ok()?
            .with_timezone(&Utc);
        let profile = self.profile.load();
        let tokens = AuthTokens {
            access_token: access,
            refresh_token: refresh,
            access_expires_at: expiry,
            user: AccountUser {
                id: profile.user_id,
                email: profile.email,
                name: None,
            },
        };
        *self.cached.lock().unwrap() = Some(tokens.clone());
        Some(tokens)
    }

    pub fn save(&self, tokens: &AuthTokens) -> bool {
        let expiry = tokens.access_expires_at.to_rfc3339_opts(SecondsFormat::Secs, true);
        let stored = self.secrets.write(ACCESS, &tokens.access_token)
            && self.secrets.write(REFRESH, &tokens.refresh_token)
            && self.secrets.write(EXPIRY, &expiry);
        if !stored {
            self.clear();
            return false;
        }
        let mut profile = self.profile.load();
        profile.email = tokens.user.email.clone();
        if !tokens.user.id.is_empty() {
            profile.user_id = tokens.user.id.clone();
        }
        self.profile.save(&profile);
        *self.cached.lock().unwrap() = Some(tokens.clone());
        true
    }

    pub fn clear(&self) {
        for account in [ACCESS, REFRESH, EXPIRY] {
            self.secrets.delete(account);
        }
        self.clear_handoff();
        self.profile.save(&Profile::default());
        *self.cached.lock().unwrap() = None;
    }

    /// Sessions saved before the id was kept learn it from `/v1/me`.
    pub fn remember_user_id(&self, id: &str) {
        if id.is_empty() {
            return;
        }
        let mut profile = self.profile.load();
        profile.user_id = id.to_string();
        self.profile.save(&profile);
        if let Some(tokens) = self.cached.lock().unwrap().as_mut() {
            tokens.user.id = id.to_string();
        }
    }

    /// The PKCE verifier never goes to the website. It stays here until the callback.
    pub fn save_handoff(&self, verifier: &str, state: &str) -> bool {
        if self.secrets.write(VERIFIER, verifier) && self.secrets.write(STATE, state) {
            return true;
        }
        self.clear_handoff();
        false
    }

    pub fn load_handoff(&self) -> Option<Handoff> {
        let verifier = self.secrets.read(VERIFIER)?;
        let state = self.secrets.read(STATE)?;
        (!verifier.is_empty() && !state.is_empty()).then_some(Handoff { verifier, state })
    }

    pub fn clear_handoff(&self) {
        self.secrets.delete(VERIFIER);
        self.secrets.delete(STATE);
    }

    /// A valid access token, refreshed when it is inside its last minute or when `force` is set
    /// (a model call came back 401). `None` means signed out: a failed refresh ends the session.
    pub async fn access_token<F, Fut>(&self, force: bool, refresh: F) -> Option<String>
    where
        F: FnOnce(String) -> Fut,
        Fut: Future<Output = Option<AuthTokens>>,
    {
        let mut last_refresh = self.refreshing.lock().await;
        let session = self.load()?;
        let just_refreshed = last_refresh.is_some_and(|at| at.elapsed() < FRESH_FOR);
        let stale = needs_refresh(session.access_expires_at, Utc::now());
        if !stale && (!force || just_refreshed) {
            return Some(session.access_token);
        }
        match refresh(session.refresh_token.clone()).await {
            Some(mut refreshed) => {
                if refreshed.user.id.is_empty() {
                    refreshed.user.id = session.user.id;
                }
                self.save(&refreshed);
                *last_refresh = Some(Instant::now());
                Some(refreshed.access_token)
            }
            None => {
                self.clear();
                None
            }
        }
    }
}

/// So the platform can hand over whichever store it has.
impl SecretStore for Box<dyn SecretStore> {
    fn read(&self, account: &str) -> Option<String> {
        (**self).read(account)
    }
    fn write(&self, account: &str, value: &str) -> bool {
        (**self).write(account, value)
    }
    fn delete(&self, account: &str) {
        (**self).delete(account)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[derive(Default)]
    pub struct MemorySecrets {
        values: Mutex<HashMap<String, String>>,
        pub refuse_writes: bool,
    }

    impl SecretStore for MemorySecrets {
        fn read(&self, account: &str) -> Option<String> {
            self.values.lock().unwrap().get(account).cloned()
        }
        fn write(&self, account: &str, value: &str) -> bool {
            if self.refuse_writes {
                return false;
            }
            self.values
                .lock()
                .unwrap()
                .insert(account.to_string(), value.to_string());
            true
        }
        fn delete(&self, account: &str) {
            self.values.lock().unwrap().remove(account);
        }
    }

    #[derive(Default)]
    pub struct MemoryProfile(Mutex<Profile>);

    impl ProfileStore for MemoryProfile {
        fn load(&self) -> Profile {
            self.0.lock().unwrap().clone()
        }
        fn save(&self, profile: &Profile) {
            *self.0.lock().unwrap() = profile.clone();
        }
    }

    fn session() -> Session<MemorySecrets, MemoryProfile> {
        Session::new(MemorySecrets::default(), MemoryProfile::default())
    }

    fn tokens(access: &str, refresh: &str, expires_in_seconds: i64) -> AuthTokens {
        AuthTokens {
            access_token: access.to_string(),
            refresh_token: refresh.to_string(),
            access_expires_at: Utc::now() + chrono::Duration::seconds(expires_in_seconds),
            user: AccountUser {
                id: "u1".into(),
                email: "ana@escola.pt".into(),
                name: None,
            },
        }
    }

    // Port of `sessionRefreshesInsideTheLastMinute` (LearnLayerTests/BackendClientTests.swift).
    #[test]
    fn session_refreshes_inside_the_last_minute() {
        let now = DateTime::from_timestamp(1_700_000_000, 0).unwrap();
        assert!(needs_refresh(now + chrono::Duration::seconds(59), now));
        assert!(!needs_refresh(now + chrono::Duration::seconds(60), now));
        assert!(needs_refresh(now - chrono::Duration::seconds(1), now));
    }

    #[test]
    fn tokens_decode_as_the_api_sends_them() {
        let json = r#"{"accessToken":"access","refreshToken":"refresh","accessExpiresAt":"2026-10-26T12:00:00Z","user":{"id":"u1","email":"ana@escola.pt"}}"#;
        let decoded: AuthTokens = serde_json::from_str(json).unwrap();
        assert_eq!(decoded.access_token, "access");
        assert_eq!(decoded.user.name, None);
        assert_eq!(decoded.access_expires_at.timestamp(), 1_793_016_000);
        let fractional = json.replace("12:00:00Z", "12:00:00.000Z");
        assert_eq!(serde_json::from_str::<AuthTokens>(&fractional).unwrap(), decoded);
    }

    #[test]
    fn saving_and_clearing() {
        let session = session();
        assert!(!session.has_refresh_token());
        assert_eq!(
            session.status(),
            SessionStatus {
                signed_in: false,
                email: String::new(),
                user_id: String::new()
            }
        );
        assert!(session.save(&tokens("a1", "r1", 900)));
        assert!(session.has_refresh_token());
        assert_eq!(session.status().email, "ana@escola.pt");
        assert_eq!(session.status().user_id, "u1");
        assert_eq!(session.load().unwrap().access_token, "a1");
        session.clear();
        assert!(!session.has_refresh_token());
        assert!(session.load().is_none());
        assert_eq!(session.status().email, "");
    }

    #[test]
    fn a_session_that_cannot_be_stored_is_not_kept() {
        let secrets = MemorySecrets {
            refuse_writes: true,
            ..Default::default()
        };
        let session = Session::new(secrets, MemoryProfile::default());
        assert!(!session.save(&tokens("a1", "r1", 900)));
        assert!(session.load().is_none());
        assert!(!session.save_handoff("verifier", "state"));
        assert!(session.load_handoff().is_none());
    }

    #[test]
    fn the_handoff_stays_until_the_callback() {
        let session = session();
        assert!(session.load_handoff().is_none());
        assert!(session.save_handoff("verifier", "state"));
        assert_eq!(
            session.load_handoff(),
            Some(Handoff {
                verifier: "verifier".into(),
                state: "state".into()
            })
        );
        session.clear_handoff();
        assert!(session.load_handoff().is_none());
    }

    #[tokio::test]
    async fn a_fresh_token_is_returned_without_a_refresh() {
        let session = session();
        session.save(&tokens("a1", "r1", 900));
        let token = session
            .access_token(false, |_| async { panic!("no refresh expected") })
            .await;
        assert_eq!(token.as_deref(), Some("a1"));
    }

    #[tokio::test]
    async fn an_expiring_token_is_refreshed_and_the_new_pair_is_saved() {
        let session = session();
        session.save(&tokens("a1", "r1", 30));
        let token = session
            .access_token(false, |refresh| async move {
                assert_eq!(refresh, "r1");
                Some(tokens("a2", "r2", 900))
            })
            .await;
        assert_eq!(token.as_deref(), Some("a2"));
        assert_eq!(session.load().unwrap().refresh_token, "r2");
    }

    #[tokio::test]
    async fn a_failed_refresh_ends_the_session() {
        let session = session();
        session.save(&tokens("a1", "r1", 30));
        assert_eq!(session.access_token(false, |_| async { None }).await, None);
        assert!(!session.has_refresh_token());
        assert_eq!(
            session.access_token(false, |_| async { panic!("signed out") }).await,
            None
        );
    }

    #[tokio::test]
    async fn two_calls_at_once_spend_the_refresh_token_once() {
        let session = Arc::new(session());
        session.save(&tokens("a1", "r1", 30));
        let refreshes = Arc::new(AtomicUsize::new(0));
        let call = |force: bool| {
            let session = session.clone();
            let refreshes = refreshes.clone();
            async move {
                session
                    .access_token(force, |refresh| async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        assert_eq!(refresh, "r1", "the old refresh token was spent twice");
                        tokio::time::sleep(Duration::from_millis(20)).await;
                        Some(tokens("a2", "r2", 900))
                    })
                    .await
            }
        };
        // One expiring-token call and two forced ones (both saw a 401) arrive together.
        let (first, second, third) = tokio::join!(call(false), call(true), call(true));
        assert_eq!(first.as_deref(), Some("a2"));
        assert_eq!(second.as_deref(), Some("a2"));
        assert_eq!(third.as_deref(), Some("a2"));
        assert_eq!(refreshes.load(Ordering::SeqCst), 1);
    }
}
