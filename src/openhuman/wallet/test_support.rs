//! Shared test plumbing for wallet unit tests across all chains.
//!
//! Provides:
//! - [`TEST_LOCK`]: serializes wallet tests that mutate the global quote store
//!   and per-chain env-var overrides.
//! - [`setup_wallet_in`]: writes a configured wallet state into a
//!   [`tempfile::TempDir`] using the standard "abandon × 11 about" mnemonic
//!   so every chain's signer derives a deterministic address.
//! - Sample addresses corresponding to that mnemonic (one per chain).
//!
//! # Keyring independence
//!
//! `setup_wallet_in` deliberately bypasses the global keyring backend by
//! calling [`super::ops::write_wallet_state_direct_for_test`] instead of the
//! production `setup()` path.  The production `save_stored_wallet_state_unlocked`
//! tries to promote the encrypted mnemonic to the OS keychain (stripping it from
//! `wallet-state.json` on success).  In the parallel 12 000-test CI run the
//! process-global `BACKEND` `OnceLock` can be initialised by an unrelated test
//! pointing to a temp directory that is later removed, so subsequent keychain
//! reads silently return `None` — causing `reveal_recovery_phrase` to panic even
//! though setup appeared to succeed.
//!
//! Writing the JSON directly guarantees that `load_stored_wallet_state_unlocked`
//! always finds `encrypted_mnemonic` in the JSON field, regardless of which
//! backend was selected first in the process.

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use tempfile::TempDir;

use super::ops::{
    write_wallet_state_direct_for_test, StoredWalletState, WalletAccount, WalletChain,
    WalletSetupSource,
};
use crate::openhuman::config::rpc as config_rpc;

pub(crate) static TEST_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// Standard BIP-39 test mnemonic — produces deterministic accounts per chain.
pub(crate) const TEST_MNEMONIC: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

pub(crate) fn sample_evm_address() -> &'static str {
    "0x9858EfFD232B4033E47d90003D41EC34EcaEda94"
}
pub(crate) fn sample_btc_address() -> &'static str {
    "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
}
pub(crate) fn sample_solana_address() -> &'static str {
    "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk"
}
pub(crate) fn sample_tron_address() -> &'static str {
    "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH"
}

pub(crate) fn sample_account(chain: WalletChain) -> WalletAccount {
    WalletAccount {
        chain,
        address: match chain {
            WalletChain::Evm => sample_evm_address().to_string(),
            WalletChain::Btc => sample_btc_address().to_string(),
            WalletChain::Solana => sample_solana_address().to_string(),
            WalletChain::Tron => sample_tron_address().to_string(),
        },
        derivation_path: match chain {
            WalletChain::Evm => "m/44'/60'/0'/0/0".to_string(),
            WalletChain::Btc => "m/84'/0'/0'/0/0".to_string(),
            WalletChain::Solana => "m/44'/501'/0'/0'".to_string(),
            WalletChain::Tron => "m/44'/195'/0'/0/0".to_string(),
        },
    }
}

/// RAII guard returned to callers so `OPENHUMAN_WORKSPACE` is restored when
/// the test scope ends — prevents one test's tempdir from leaking into the
/// next test in the same process. Drop the guard explicitly or let it fall
/// out of scope at the end of the test.
pub(crate) struct WorkspaceEnvGuard {
    prev: Option<std::ffi::OsString>,
}

impl Drop for WorkspaceEnvGuard {
    fn drop(&mut self) {
        match self.prev.take() {
            Some(v) => std::env::set_var("OPENHUMAN_WORKSPACE", v),
            None => std::env::remove_var("OPENHUMAN_WORKSPACE"),
        }
    }
}

/// Set up a wallet in `temp` in a way that is completely independent of the
/// process-global keyring backend.
///
/// The encrypted mnemonic is written directly into `wallet-state.json` via
/// [`write_wallet_state_direct_for_test`] — no keychain promotion, no
/// `BACKEND` `OnceLock` involvement.  `reveal_recovery_phrase` will find the
/// mnemonic in the JSON field on every backend and in any test-execution order.
pub(crate) async fn setup_wallet_in(temp: &TempDir) -> Result<(), String> {
    // Point config at this temp workspace for the duration of the call.
    // The caller holds TEST_LOCK so no other wallet test races on this var.
    std::env::set_var("OPENHUMAN_WORKSPACE", temp.path());

    let config = config_rpc::load_config_with_timeout().await?;

    // Encrypt via SecretStore (config-local master key, NOT the global BACKEND).
    let encrypted = crate::openhuman::encryption::rpc::encrypt_secret(&config, TEST_MNEMONIC)
        .await?
        .value;

    log::debug!(
        "[wallet][test] setup_wallet_in: encrypted mnemonic len={} workspace={}",
        encrypted.len(),
        temp.path().display()
    );

    // Build the wallet state with the encrypted mnemonic IN the JSON field.
    // Bypassing `setup()` / `save_stored_wallet_state_unlocked()` means the
    // keychain is never probed, so the global BACKEND OnceLock is irrelevant.
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let state = StoredWalletState {
        consent_granted: true,
        source: WalletSetupSource::Imported,
        mnemonic_word_count: 12,
        encrypted_mnemonic: Some(encrypted),
        accounts: [
            WalletChain::Evm,
            WalletChain::Btc,
            WalletChain::Solana,
            WalletChain::Tron,
        ]
        .into_iter()
        .map(sample_account)
        .collect(),
        updated_at_ms: now_ms,
    };

    // Write directly — no keychain interaction.
    // TEST_LOCK (held by the calling test) already serializes wallet tests so
    // we do not need to acquire WALLET_STATE_FILE_LOCK here.
    write_wallet_state_direct_for_test(&config, &state)?;

    log::debug!("[wallet][test] setup_wallet_in: wallet-state.json written successfully");

    Ok(())
}
