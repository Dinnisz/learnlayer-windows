//! The Windows Credential Manager. Each value is its own generic credential, `LearnLayer.Session/<name>`.

use crate::session::{SecretStore, SERVICE};

pub struct CredentialManager;

impl CredentialManager {
    fn entry(account: &str) -> Option<keyring::Entry> {
        keyring::Entry::new_with_target(&format!("{SERVICE}/{account}"), SERVICE, account).ok()
    }
}

impl SecretStore for CredentialManager {
    fn read(&self, account: &str) -> Option<String> {
        let bytes = Self::entry(account)?.get_secret().ok()?;
        String::from_utf8(bytes).ok()
    }

    fn write(&self, account: &str, value: &str) -> bool {
        // Bytes, not a UTF-16 password: a credential blob holds at most 2560 bytes.
        Self::entry(account).is_some_and(|entry| entry.set_secret(value.as_bytes()).is_ok())
    }

    fn delete(&self, account: &str) {
        if let Some(entry) = Self::entry(account) {
            let _ = entry.delete_credential();
        }
    }
}
