//! The two API calls the native side makes itself: refreshing the session and ending it.
//! Everything else goes through `core/ai/backendClient.ts`.

use std::time::Duration;

use serde_json::json;

use crate::config;
use crate::session::AuthTokens;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// `POST /v1/auth/refresh`. `None` for any failure: the caller ends the session, as the Mac does.
pub async fn refresh(http: &reqwest::Client, api_base: &str, refresh_token: String) -> Option<AuthTokens> {
    let response = http
        .post(config::endpoint("/v1/auth/refresh", api_base))
        .header("Accept", "application/json")
        .json(&json!({ "refreshToken": refresh_token }))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json::<AuthTokens>().await.ok()
}

/// `POST /v1/auth/logout`. The session is forgotten here whether or not the server answers.
pub async fn logout(http: &reqwest::Client, api_base: &str, access_token: &str, refresh_token: &str) {
    let _ = http
        .post(config::endpoint("/v1/auth/logout", api_base))
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .json(&json!({ "refreshToken": refresh_token }))
        .send()
        .await;
}
