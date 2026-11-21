//! The login Keychain. Each value is its own generic password, service `LearnLayerDesktop.Session`,
//! account `<name>`: apart from the Swift app's items, which this build never reads or changes.

use crate::session::SecretStore;

const SERVICE: &str = "LearnLayerDesktop.Session";

pub struct Keychain;

impl Keychain {
    fn entry(account: &str) -> Option<keyring::Entry> {
        keyring::Entry::new(SERVICE, account).ok()
    }
}

impl SecretStore for Keychain {
    fn read(&self, account: &str) -> Option<String> {
        let bytes = Self::entry(account)?.get_secret().ok()?;
        String::from_utf8(bytes).ok()
    }

    fn write(&self, account: &str, value: &str) -> bool {
        Self::entry(account).is_some_and(|entry| entry.set_secret(value.as_bytes()).is_ok())
    }

    fn delete(&self, account: &str) {
        if let Some(entry) = Self::entry(account) {
            let _ = entry.delete_credential();
        }
    }
}
