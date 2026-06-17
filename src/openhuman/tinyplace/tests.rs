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

// ── Inbox write-handler param validation ──────────────────────────────────────
//
// The item-targeting inbox writes require `itemId` and must error at param
// validation — before constructing the client or hitting the network. Awaiting
// the handler future with empty params exercises exactly that path.

#[cfg(test)]
mod inbox_write_handlers {
    use serde_json::Map;

    use crate::openhuman::tinyplace::manifest::{
        handle_tinyplace_inbox_archive, handle_tinyplace_inbox_mark_read,
        handle_tinyplace_inbox_remove, handle_tinyplace_inbox_unarchive,
    };

    #[tokio::test]
    async fn mark_read_requires_item_id() {
        let err = handle_tinyplace_inbox_mark_read(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("itemId"), "got: {err}");
    }

    #[tokio::test]
    async fn archive_requires_item_id() {
        let err = handle_tinyplace_inbox_archive(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("itemId"), "got: {err}");
    }

    #[tokio::test]
    async fn unarchive_requires_item_id() {
        let err = handle_tinyplace_inbox_unarchive(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("itemId"), "got: {err}");
    }

    #[tokio::test]
    async fn remove_requires_item_id() {
        let err = handle_tinyplace_inbox_remove(Map::new()).await.unwrap_err();
        assert!(err.contains("itemId"), "got: {err}");
    }
}

// ── Channel / broadcast / group membership-handler param validation ────────────

#[cfg(test)]
mod membership_handlers {
    use serde_json::Map;

    use crate::openhuman::tinyplace::manifest::{
        handle_tinyplace_broadcasts_subscribe, handle_tinyplace_broadcasts_unsubscribe,
        handle_tinyplace_channels_join, handle_tinyplace_channels_leave,
        handle_tinyplace_groups_join, handle_tinyplace_groups_leave,
    };

    #[tokio::test]
    async fn channels_join_requires_channel_id() {
        let err = handle_tinyplace_channels_join(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("channelId"), "got: {err}");
    }

    #[tokio::test]
    async fn channels_leave_requires_channel_id() {
        let err = handle_tinyplace_channels_leave(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("channelId"), "got: {err}");
    }

    #[tokio::test]
    async fn broadcasts_subscribe_requires_broadcast_id() {
        let err = handle_tinyplace_broadcasts_subscribe(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("broadcastId"), "got: {err}");
    }

    #[tokio::test]
    async fn broadcasts_unsubscribe_requires_broadcast_id() {
        let err = handle_tinyplace_broadcasts_unsubscribe(Map::new())
            .await
            .unwrap_err();
        assert!(err.contains("broadcastId"), "got: {err}");
    }

    #[tokio::test]
    async fn groups_join_requires_group_id() {
        let err = handle_tinyplace_groups_join(Map::new()).await.unwrap_err();
        assert!(err.contains("groupId"), "got: {err}");
    }

    #[tokio::test]
    async fn groups_leave_requires_group_id() {
        let err = handle_tinyplace_groups_leave(Map::new()).await.unwrap_err();
        assert!(err.contains("groupId"), "got: {err}");
    }
}

// ── Messages graceful-degrade helpers (staging endpoint gaps) ──────────────────

#[cfg(test)]
mod messages_degrade {
    use std::collections::HashMap;

    use crate::openhuman::tinyplace::manifest::{
        channels_list_degrade, inbox_list_degrade, messages_list_degrade,
    };

    /// Synthetic `Error::Http` with an arbitrary status and no payment challenge.
    fn http_error(status: u16) -> tinyplace::Error {
        tinyplace::Error::Http(Box::new(tinyplace::error::HttpError {
            status,
            message: format!("HTTP {status}: /test"),
            body: serde_json::Value::Null,
            headers: HashMap::new(),
            payment_required: None,
        }))
    }

    /// A real serde_json error (the SDK's `Error::Serialization` source).
    fn serialization_error() -> tinyplace::Error {
        let err = serde_json::from_str::<i64>("\"not a number\"").unwrap_err();
        tinyplace::Error::Serialization(err)
    }

    #[test]
    fn channels_404_degrades_to_empty_list() {
        let degraded = channels_list_degrade(&http_error(404)).expect("404 should degrade");
        assert_eq!(degraded, serde_json::json!({ "channels": [] }));
    }

    #[test]
    fn channels_non_404_propagates() {
        assert!(channels_list_degrade(&http_error(500)).is_none());
        assert!(channels_list_degrade(&serialization_error()).is_none());
    }

    #[test]
    fn inbox_serialization_error_degrades_to_empty() {
        let degraded =
            inbox_list_degrade(&serialization_error()).expect("serialization error should degrade");
        assert_eq!(
            degraded,
            serde_json::json!({
                "items": [],
                "cursor": null,
                "unreadCount": 0,
                "totalCount": 0,
            })
        );
    }

    #[test]
    fn inbox_non_serialization_propagates() {
        assert!(inbox_list_degrade(&http_error(500)).is_none());
    }

    #[test]
    fn messages_serialization_error_degrades_to_empty() {
        let degraded = messages_list_degrade(&serialization_error())
            .expect("serialization error should degrade");
        assert_eq!(degraded, serde_json::json!({ "messages": [] }));
    }

    #[test]
    fn messages_non_serialization_propagates() {
        assert!(messages_list_degrade(&http_error(500)).is_none());
    }
}

// ── Make-discoverable card builder ─────────────────────────────────────────────

#[cfg(test)]
mod default_agent_card {
    use crate::openhuman::tinyplace::manifest::build_default_agent_card;

    fn identity(username: &str, primary: bool) -> tinyplace::types::Identity {
        tinyplace::types::Identity {
            username: username.to_string(),
            crypto_id: "AgentIdBase58".to_string(),
            public_key: "pk".to_string(),
            registered_at: "2026-01-01T00:00:00Z".to_string(),
            expires_at: "2027-01-01T00:00:00Z".to_string(),
            status: "active".to_string(),
            registration_tx: None,
            payment_methods: None,
            primary: Some(primary),
            subnames: None,
            signature: None,
            payment: None,
            last_renewal_tx: None,
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn uses_registered_handle_when_present() {
        let card =
            build_default_agent_card("AgentIdBase58", "pubkeyb64", Some(&identity("alice", true)));
        assert_eq!(card.agent_id, "AgentIdBase58");
        assert_eq!(card.crypto_id, "AgentIdBase58");
        assert_eq!(card.name, "alice");
        assert_eq!(card.username.as_deref(), Some("alice"));
        assert_eq!(card.public_key.as_deref(), Some("pubkeyb64"));
        // Timestamps are non-empty placeholders (backend reassigns on upsert).
        assert!(!card.created_at.is_empty());
        assert!(!card.updated_at.is_empty());
    }

    #[test]
    fn falls_back_to_agent_id_without_identity() {
        let card = build_default_agent_card("AgentIdBase58", "pubkeyb64", None);
        assert_eq!(card.name, "AgentIdBase58");
        assert_eq!(card.username, None);
    }
}
