//! Unit tests for the tinyplace domain.
//!
//! `signer_round_trip`: derives the 32-byte Ed25519 seed from the same test
//! mnemonic the wallet uses (SLIP-0010 `m/44'/501'/0'/0'`), builds a
//! `tinyplace::LocalSigner`, and asserts `agent_id()` matches the wallet's
//! known base58 Solana address (pinned at `wallet/chains/solana.rs:693`).
//!
//! `map_err_tests`: synthetic `tinyplace::Error` values map to the expected
//! string representations.

// ── Signer round-trip ─────────────────────────────────────────────────────────

#[cfg(test)]
mod signer_round_trip {
    use coins_bip39::{English, Mnemonic};
    use ed25519_dalek::SigningKey;
    use hmac::{Hmac, Mac};
    use sha2::Sha512;
    use tinyplace::Signer; // brings the `agent_id()` trait method into scope for `LocalSigner`

    /// SLIP-0010 Ed25519 child-key derivation (all-hardened path).
    /// Mirrors `wallet/chains/solana.rs:94-116`.
    fn slip10_ed25519_derive(seed: &[u8], path: &[u32]) -> [u8; 32] {
        type HmacSha512 = Hmac<Sha512>;
        let mut mac = HmacSha512::new_from_slice(b"ed25519 seed").unwrap();
        mac.update(seed);
        let i = mac.finalize().into_bytes();
        let mut key = [0u8; 32];
        let mut chain_code = [0u8; 32];
        key.copy_from_slice(&i[..32]);
        chain_code.copy_from_slice(&i[32..]);
        for index in path {
            let hardened = *index | 0x8000_0000;
            let mut mac = HmacSha512::new_from_slice(&chain_code).unwrap();
            mac.update(&[0u8]);
            mac.update(&key);
            mac.update(&hardened.to_be_bytes());
            let i = mac.finalize().into_bytes();
            key.copy_from_slice(&i[..32]);
            chain_code.copy_from_slice(&i[32..]);
        }
        key
    }

    /// Derive the 32-byte SLIP-0010 seed from a BIP39 mnemonic, mirroring the
    /// path taken by `wallet/chains/solana.rs:141-153`.
    fn derive_seed_bytes(mnemonic_str: &str, path_indices: &[u32]) -> [u8; 32] {
        let mnemonic: Mnemonic<English> = mnemonic_str.trim().parse().expect("valid mnemonic");
        let seed = mnemonic.to_seed(None).expect("seed derivation");
        slip10_ed25519_derive(&seed, path_indices)
    }

    #[test]
    fn seed_to_agent_id_matches_wallet_known_address() {
        // Generic test mnemonic (not a real wallet — safe to commit per project
        // rules: "never hardcode real names/emails in tests, use generic placeholders").
        // This is the BIP39 standard test vector "abandon×11 about".
        let mnemonic =
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

        // Derive the 32-byte secret: m/44'/501'/0'/0' (all-hardened, Solana path).
        let secret = derive_seed_bytes(
            mnemonic,
            &[
                44 | 0x8000_0000,
                501 | 0x8000_0000,
                0 | 0x8000_0000,
                0 | 0x8000_0000,
            ],
        );

        // Build tiny.place LocalSigner from the same bytes tinyplace_signer_seed() returns.
        let signer = tinyplace::LocalSigner::from_seed(&secret)
            .expect("LocalSigner::from_seed must succeed");

        // Verify the agent_id (base58 Solana address) matches the wallet's known fixture.
        // Pinned at wallet/chains/solana.rs:693.
        assert_eq!(
            signer.agent_id(),
            "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
            "tiny.place agent_id must round-trip to the wallet's Solana address for the same mnemonic"
        );

        // Verify the dalek SigningKey produces the same public key when constructed
        // from the same 32-byte secret (belt-and-suspenders parity check).
        let dalek_key = SigningKey::from_bytes(&secret);
        let dalek_pubkey = bs58::encode(dalek_key.verifying_key().to_bytes()).into_string();
        assert_eq!(
            dalek_pubkey,
            signer.agent_id(),
            "dalek verifying_key and LocalSigner.agent_id() must agree"
        );
    }
}

// ── map_err tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod map_err_tests {
    use crate::openhuman::tinyplace::ops::map_err;
    use tinyplace::error::{HttpError, PaymentChallenge, PaymentRequiredChallenge};

    #[test]
    fn http_404_maps_to_plain_string() {
        let http_err = HttpError {
            status: 404,
            message: "HTTP 404: /directory/agents/missing".to_string(),
            body: serde_json::Value::Null,
            headers: Default::default(),
            payment_required: None,
        };
        let err = tinyplace::Error::Http(Box::new(http_err));
        let s = map_err(err);
        assert!(
            !s.starts_with("PAYMENT_REQUIRED:"),
            "404 must not produce PAYMENT_REQUIRED prefix"
        );
        assert!(
            s.contains("404"),
            "404 error string must mention status code"
        );
    }

    #[test]
    fn http_402_maps_to_payment_required_prefix() {
        let challenge = PaymentRequiredChallenge {
            error: Some("payment required".to_string()),
            payment: PaymentChallenge {
                scheme: Some("x402".to_string()),
                amount: Some("0.01".to_string()),
                ..Default::default()
            },
        };
        let http_err = HttpError {
            status: 402,
            message: "HTTP 402: Payment Required".to_string(),
            body: serde_json::Value::Null,
            headers: Default::default(),
            payment_required: Some(challenge),
        };
        let err = tinyplace::Error::Http(Box::new(http_err));
        let s = map_err(err);
        assert!(
            s.starts_with("PAYMENT_REQUIRED:"),
            "402 error must have PAYMENT_REQUIRED: prefix, got: {s}"
        );
        // Must be valid JSON after the prefix
        let json_part = &s["PAYMENT_REQUIRED:".len()..];
        serde_json::from_str::<serde_json::Value>(json_part)
            .expect("PAYMENT_REQUIRED payload must be valid JSON");
    }
}
