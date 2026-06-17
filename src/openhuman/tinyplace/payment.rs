//! x402 payment fulfillment bridge — **section-agnostic**.
//!
//! Turns a `402 Payment Required` [`PaymentChallenge`] into a signed
//! [`X402PaymentMap`] by paying on-chain through the OpenHuman wallet and then
//! signing the x402 authorization with the tiny.place identity key.
//!
//! The flow is shared verbatim across register / buy / bid / offer; callers
//! parameterise the purpose and any extra signed metadata via [`PaymentContext`].
//!
//! ## What this module does NOT do
//!
//! - It does **not** build the canonical message, sign it, or flatten the map —
//!   that lives in the SDK ([`tinyplace::x402::build_x402_payment_map`]).
//! - It does **not** *pick* a Solana cluster — `challenge.network` is passed
//!   through verbatim and the asset is routed by symbol. It does, however,
//!   expose a [`ensure_cluster_matches`] guard so callers can fail closed when a
//!   challenge's network clearly targets a different cluster than the wallet is
//!   configured for (Risk R6 — never broadcast to the wrong chain).
//! - It does **not** expose an RPC controller. The section write-handlers
//!   (register / marketplace, in later PRs) call [`fulfill_payment`] and attach
//!   the returned payment map to their domain request.
//!
//! Marketplace write handlers (buy / bid / offer) are still pending, so a few
//! helpers here are not yet referenced; keep the targeted allows until those
//! PRs land rather than deleting otherwise-correct code.

use std::collections::HashMap;

use tinyplace::signer::Signer;
use tinyplace::x402::{
    build_x402_payment_map, generate_nonce, X402PaymentAuthorizationOptions, X402PaymentMap,
    X402PaymentReferenceOptions,
};
use tinyplace::PaymentChallenge;

use crate::openhuman::wallet::{
    execute_prepared, prepare_transfer, solana_cluster, ExecutePreparedParams,
    PrepareTransferParams, SolanaCluster, WalletChain,
};

const LOG_PREFIX: &str = "[tinyplace-pay]";

/// Reject a challenge whose expiry is within this many seconds of now — leaves
/// headroom for the on-chain broadcast + verification round-trip.
const EXPIRY_SKEW_SECS: i64 = 30;

// ── Public types ──────────────────────────────────────────────────────────────

/// Caller-supplied purpose + extra metadata. Parameterises the otherwise
/// identical register / buy / bid / offer flows.
#[derive(Debug, Clone)]
pub(crate) struct PaymentContext {
    /// Folded into the signed metadata as `purpose` (e.g. `"identity.register"`,
    /// `"marketplace.buy"`).
    pub(crate) purpose: String,
    /// Nonce prefix used when the challenge omits a nonce (e.g. `"register"` →
    /// `register_<hex>`).
    pub(crate) nonce_prefix: String,
    /// Extra signed metadata (e.g. `{ "identity": "@handle" }`,
    /// `{ "listingId": "…" }`).
    pub(crate) extra_metadata: HashMap<String, String>,
}

/// Result of a completed on-chain payment plus its signed x402 authorization.
#[derive(Debug, Clone)]
pub(crate) struct FulfilledPayment {
    /// The flat x402 payment map to attach to the domain request.
    pub(crate) payment_map: X402PaymentMap,
    /// The on-chain Solana transaction signature that moved the funds.
    pub(crate) on_chain_tx: String,
    /// The wallet quote id the transfer was executed under. Surfaced for
    /// diagnostics/audit; not all callers read it (the register handler only
    /// needs `on_chain_tx`).
    #[allow(dead_code)]
    pub(crate) quote_id: String,
}

// ── Internal types ────────────────────────────────────────────────────────────

/// A challenge whose required fields have been validated and asset-routed.
#[derive(Debug, Clone)]
struct ValidatedChallenge {
    network: String,
    asset: String,
    amount: String,
    to: String,
    nonce: Option<String>,
    expires_at: Option<String>,
    /// `None` for native SOL, `Some("USDC")` for the SPL token.
    asset_symbol: Option<String>,
}

// ── Pure helpers (unit-tested; no network, no funds) ──────────────────────────

/// Validate required challenge fields, check expiry, and route the asset.
fn validate_challenge(challenge: &PaymentChallenge) -> Result<ValidatedChallenge, String> {
    let asset = non_empty(&challenge.asset).ok_or("x402 challenge missing 'asset'")?;
    let amount = non_empty(&challenge.amount).ok_or("x402 challenge missing 'amount'")?;
    let to = non_empty(&challenge.to).ok_or("x402 challenge missing 'to'")?;
    let network = non_empty(&challenge.network).ok_or("x402 challenge missing 'network'")?;

    let asset_symbol = match asset.as_str() {
        "SOL" => None,
        "USDC" => Some("USDC".to_string()),
        other => return Err(format!("unsupported x402 asset: {other}")),
    };

    let expires_at = non_empty(&challenge.expires_at);
    if let Some(expiry) = &expires_at {
        if is_expired(expiry) {
            return Err("payment challenge expired".to_string());
        }
    }

    Ok(ValidatedChallenge {
        network,
        asset,
        amount,
        to,
        nonce: non_empty(&challenge.nonce),
        expires_at,
        asset_symbol,
    })
}

/// Map a validated challenge to wallet transfer params (asset routing lives here).
fn to_transfer_params(v: &ValidatedChallenge) -> PrepareTransferParams {
    PrepareTransferParams {
        chain: WalletChain::Solana,
        to_address: v.to.clone(),
        amount_raw: v.amount.clone(),
        asset_symbol: v.asset_symbol.clone(),
        evm_network: None,
    }
}

/// Build and sign the x402 payment map via the SDK. Offline — needs only a
/// signer. The `on_chain_tx` is attached to the payment **references**
/// (`onChainTx`/`tx`/`transaction`), never to the `signature` field (which is
/// the off-chain Ed25519 authorization signature).
async fn build_payment_map(
    signer: &dyn Signer,
    v: &ValidatedChallenge,
    on_chain_tx: &str,
    ctx: &PaymentContext,
) -> Result<X402PaymentMap, String> {
    let mut metadata = ctx.extra_metadata.clone();
    metadata.insert("purpose".to_string(), ctx.purpose.clone());

    // Prefer the challenge nonce; otherwise mint one with the caller's prefix so
    // the SDK default ("pay") does not leak in.
    let nonce = v
        .nonce
        .clone()
        .unwrap_or_else(|| generate_nonce(Some(&ctx.nonce_prefix)));

    let options = X402PaymentAuthorizationOptions {
        network: v.network.clone(),
        asset: v.asset.clone(),
        amount: v.amount.clone(),
        from: Some(signer.agent_id()),
        to: v.to.clone(),
        nonce: Some(nonce),
        expires_at: v.expires_at.clone(),
        metadata: Some(metadata),
        references: X402PaymentReferenceOptions {
            on_chain_tx: Some(on_chain_tx.to_string()),
            tx: Some(on_chain_tx.to_string()),
            transaction: Some(on_chain_tx.to_string()),
            ..Default::default()
        },
        // scheme (→ "exact"), expires_in_ms, domain (→ "tiny.place") and
        // public_key_base64 (→ from signer) all take SDK defaults.
        ..Default::default()
    };

    build_x402_payment_map(signer, options)
        .await
        .map_err(|e| format!("x402 authorization signing failed: {e}"))
}

// ── Devnet guard (Risk R6) ────────────────────────────────────────────────────

/// CAIP-2 genesis-hash references for the public Solana clusters.
const MAINNET_GENESIS_PREFIX: &str = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEVNET_GENESIS_PREFIX: &str = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

/// Loosely classify a challenge's `network` string into a Solana cluster.
///
/// Recognises both the human form (`"solana-devnet"`, `"…mainnet…"`) and the
/// CAIP-2 genesis-hash form (`"solana:5eykt4…"`). Returns `None` when the
/// format is unrecognised — the backend remains the source of truth, so an
/// unknown network is allowed through rather than blocked.
fn classify_network(network: &str) -> Option<SolanaCluster> {
    let lower = network.to_lowercase();
    if lower.contains("devnet") {
        return Some(SolanaCluster::Devnet);
    }
    if lower.contains("mainnet") {
        return Some(SolanaCluster::Mainnet);
    }
    // Testnet is unsupported; treat as unknown (None) so we never silently map
    // it onto mainnet/devnet.
    if network.contains(DEVNET_GENESIS_PREFIX) {
        return Some(SolanaCluster::Devnet);
    }
    if network.contains(MAINNET_GENESIS_PREFIX) {
        return Some(SolanaCluster::Mainnet);
    }
    None
}

/// Fail closed when a challenge's network clearly targets a different Solana
/// cluster than OpenHuman is configured for. Prevents broadcasting a transfer to
/// the wrong chain (e.g. paying a devnet challenge from a mainnet-configured
/// wallet). Unknown/unparseable networks are allowed through.
///
/// Call this **before** [`fulfill_payment`] in the confirmed-spend path. Reads
/// the configured cluster from the environment via [`solana_cluster`]; the pure
/// comparison lives in [`cluster_guard`] (unit-tested without env mutation).
pub(crate) fn ensure_cluster_matches(network: &str) -> Result<(), String> {
    cluster_guard(solana_cluster(), network)
}

/// Pure cluster-mismatch check (no env access — testable in isolation).
fn cluster_guard(configured: SolanaCluster, network: &str) -> Result<(), String> {
    match classify_network(network) {
        Some(challenge_cluster) if challenge_cluster != configured => {
            log::warn!(
                "{LOG_PREFIX} cluster mismatch: challenge network='{network}' \
                 ({challenge_cluster:?}) but wallet configured for {configured:?}"
            );
            Err(format!(
                "x402 challenge targets {challenge_cluster:?} but the wallet is configured for \
                 {configured:?}; set OPENHUMAN_SOLANA_CLUSTER to match before paying"
            ))
        }
        other => {
            log::debug!(
                "{LOG_PREFIX} cluster guard ok: network='{network}' classified={other:?} \
                 configured={configured:?}"
            );
            Ok(())
        }
    }
}

// ── High-level orchestrator (thin; logic delegated to the tested helpers) ─────

/// Validate the challenge, pay on-chain (`prepare_transfer` + `execute_prepared`
/// with `confirmed: true`), sign the x402 authorization, and return the payment
/// map plus on-chain tx and quote id.
///
/// Spends real funds when it reaches the wallet calls — callers MUST gate this
/// behind an explicit, user-confirmed action.
pub(crate) async fn fulfill_payment(
    challenge: &PaymentChallenge,
    signer: &dyn Signer,
    ctx: PaymentContext,
) -> Result<FulfilledPayment, String> {
    let v = validate_challenge(challenge)?;
    log::debug!(
        "{LOG_PREFIX} fulfill purpose={} asset={} amount={} to={}",
        ctx.purpose,
        v.asset,
        v.amount,
        truncate(&v.to),
    );

    let prepared = prepare_transfer(to_transfer_params(&v)).await?.value;
    let quote_id = prepared.quote_id;
    log::debug!("{LOG_PREFIX} prepared transfer quote_id={quote_id}");

    let exec = execute_prepared(ExecutePreparedParams {
        quote_id: quote_id.clone(),
        confirmed: true,
    })
    .await?
    .value;
    let on_chain_tx = exec.transaction_hash;
    log::debug!(
        "{LOG_PREFIX} transfer broadcast tx={} quote_id={quote_id}",
        truncate(&on_chain_tx),
    );

    let payment_map = build_payment_map(signer, &v, &on_chain_tx, &ctx).await?;
    log::debug!(
        "{LOG_PREFIX} x402 authorization signed purpose={} nonce_present_in_challenge={}",
        ctx.purpose,
        v.nonce.is_some(),
    );

    Ok(FulfilledPayment {
        payment_map,
        on_chain_tx,
        quote_id,
    })
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/// Trim + treat empty as absent.
fn non_empty(field: &Option<String>) -> Option<String> {
    field
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// True when `expires_at` parses to a time within [`EXPIRY_SKEW_SECS`] of now.
/// Lenient on parse failure: logs and treats the challenge as non-expired (the
/// backend remains the source of truth on expiry).
fn is_expired(expires_at: &str) -> bool {
    match chrono::DateTime::parse_from_rfc3339(expires_at) {
        Ok(exp) => {
            let cutoff = chrono::Utc::now() + chrono::Duration::seconds(EXPIRY_SKEW_SECS);
            exp.with_timezone(&chrono::Utc) < cutoff
        }
        Err(e) => {
            log::warn!(
                "{LOG_PREFIX} could not parse challenge expiry '{expires_at}': {e}; \
                 treating as non-expired"
            );
            false
        }
    }
}

/// Truncate an identifier for logs (`head…tail`). Char-based so it never panics
/// on a multi-byte UTF-8 boundary. Never used on secret material.
fn truncate(s: &str) -> String {
    let count = s.chars().count();
    if count <= 12 {
        s.to_string()
    } else {
        let head: String = s.chars().take(6).collect();
        let tail: String = s.chars().skip(count - 4).collect();
        format!("{head}…{tail}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::{general_purpose::STANDARD as B64, Engine as _};
    use ed25519_dalek::{Signature, SigningKey, Verifier};
    use tinyplace::signer::LocalSigner;
    use tinyplace::x402::{build_canonical_message, X402AuthorizationFields};

    const TEST_SEED: [u8; 32] = [7u8; 32];

    fn test_signer() -> LocalSigner {
        LocalSigner::from_seed(&TEST_SEED).expect("test seed is 32 bytes")
    }

    fn future_expiry() -> String {
        (chrono::Utc::now() + chrono::Duration::minutes(10))
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string()
    }

    fn past_expiry() -> String {
        (chrono::Utc::now() - chrono::Duration::minutes(10))
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string()
    }

    fn mock_challenge(asset: &str) -> PaymentChallenge {
        PaymentChallenge {
            scheme: Some("exact".into()),
            network: Some("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp".into()),
            asset: Some(asset.into()),
            amount: Some("10000000".into()),
            to: Some("FaciL1tatorBase58Recipient0000000000000000".into()),
            expires_at: Some(future_expiry()),
            ..Default::default()
        }
    }

    fn test_ctx() -> PaymentContext {
        let mut extra = HashMap::new();
        extra.insert("identity".to_string(), "@tester".to_string());
        PaymentContext {
            purpose: "identity.register".to_string(),
            nonce_prefix: "register".to_string(),
            extra_metadata: extra,
        }
    }

    // ── validate_challenge / asset routing ────────────────────────────────────

    #[test]
    fn validate_usdc_routes_to_spl() {
        let v = validate_challenge(&mock_challenge("USDC")).expect("valid");
        assert_eq!(v.asset_symbol.as_deref(), Some("USDC"));
        assert_eq!(v.asset, "USDC");
        assert_eq!(v.amount, "10000000");
        assert_eq!(v.to, "FaciL1tatorBase58Recipient0000000000000000");
    }

    #[test]
    fn validate_sol_routes_to_native() {
        let v = validate_challenge(&mock_challenge("SOL")).expect("valid");
        assert_eq!(v.asset_symbol, None);
        assert_eq!(v.asset, "SOL");
    }

    #[test]
    fn validate_rejects_unsupported_asset() {
        let err = validate_challenge(&mock_challenge("WBTC")).unwrap_err();
        assert!(err.contains("unsupported"), "got: {err}");
        assert!(err.contains("WBTC"), "got: {err}");
    }

    #[test]
    fn validate_rejects_missing_amount_or_to() {
        let mut c = mock_challenge("USDC");
        c.amount = None;
        assert!(validate_challenge(&c).unwrap_err().contains("amount"));

        let mut c = mock_challenge("USDC");
        c.to = Some("   ".into()); // whitespace counts as absent
        assert!(validate_challenge(&c).unwrap_err().contains("'to'"));

        let mut c = mock_challenge("USDC");
        c.network = None;
        assert!(validate_challenge(&c).unwrap_err().contains("network"));
    }

    #[test]
    fn validate_rejects_expired_challenge() {
        let mut c = mock_challenge("USDC");
        c.expires_at = Some(past_expiry());
        assert!(validate_challenge(&c).unwrap_err().contains("expired"));
    }

    #[test]
    fn validate_accepts_future_expiry() {
        let mut c = mock_challenge("USDC");
        c.expires_at = Some(future_expiry());
        assert!(validate_challenge(&c).is_ok());
        // Unparseable expiry is lenient (non-expired), not a hard failure.
        c.expires_at = Some("not-a-timestamp".into());
        assert!(validate_challenge(&c).is_ok());
    }

    // ── cluster guard (devnet R6; pure, env-independent) ──────────────────────

    #[test]
    fn classify_network_recognises_human_and_genesis_forms() {
        assert_eq!(
            classify_network("solana-devnet"),
            Some(SolanaCluster::Devnet)
        );
        assert_eq!(
            classify_network("solana-mainnet-beta"),
            Some(SolanaCluster::Mainnet)
        );
        // CAIP-2 genesis-hash references.
        assert_eq!(
            classify_network("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1xyz"),
            Some(SolanaCluster::Devnet)
        );
        assert_eq!(
            classify_network("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
            Some(SolanaCluster::Mainnet)
        );
        // Unrecognised → None (allowed through; backend is source of truth).
        assert_eq!(classify_network("solana:someunknownhash"), None);
        assert_eq!(classify_network("solana-testnet"), None);
    }

    #[test]
    fn cluster_guard_blocks_mismatch_allows_match_and_unknown() {
        // Match → Ok.
        assert!(cluster_guard(SolanaCluster::Devnet, "solana-devnet").is_ok());
        assert!(cluster_guard(SolanaCluster::Mainnet, "solana-mainnet").is_ok());
        // Mismatch → Err naming both clusters.
        let err = cluster_guard(SolanaCluster::Mainnet, "solana-devnet").unwrap_err();
        assert!(err.contains("Devnet"), "got: {err}");
        assert!(err.contains("Mainnet"), "got: {err}");
        assert!(err.contains("OPENHUMAN_SOLANA_CLUSTER"), "got: {err}");
        // Unknown network → Ok regardless of configured cluster.
        assert!(cluster_guard(SolanaCluster::Devnet, "solana:unknownhash").is_ok());
        assert!(cluster_guard(SolanaCluster::Mainnet, "solana:unknownhash").is_ok());
    }

    #[test]
    fn ensure_cluster_matches_allows_unknown_network() {
        // Env-independent: the None branch is Ok for any configured cluster.
        assert!(ensure_cluster_matches("solana:unparseable-network-id").is_ok());
    }

    // ── truncate (log helper) ─────────────────────────────────────────────────

    #[test]
    fn truncate_is_char_boundary_safe() {
        // ASCII base58/base64 (the real inputs) abbreviate as head…tail.
        assert_eq!(truncate("5SoLaNaTxSignature0000"), "5SoLaN…0000");
        assert_eq!(truncate("short"), "short");
        // Multi-byte UTF-8 must not panic on a byte-boundary slice.
        let multibyte = "日本語のながいテキストです１２３４";
        let out = truncate(multibyte); // would panic with byte slicing
        assert!(out.contains('…'));
    }

    // ── to_transfer_params ────────────────────────────────────────────────────

    #[test]
    fn transfer_params_shape() {
        let v = validate_challenge(&mock_challenge("USDC")).unwrap();
        let p = to_transfer_params(&v);
        assert_eq!(p.chain, WalletChain::Solana);
        assert_eq!(p.to_address, v.to);
        assert_eq!(p.amount_raw, "10000000");
        assert_eq!(p.asset_symbol.as_deref(), Some("USDC"));
        assert!(p.evm_network.is_none());
    }

    // ── build_payment_map (offline; deterministic test signer) ────────────────

    async fn build_map(asset: &str, ctx: &PaymentContext, on_chain_tx: &str) -> X402PaymentMap {
        let signer = test_signer();
        let v = validate_challenge(&mock_challenge(asset)).unwrap();
        build_payment_map(&signer, &v, on_chain_tx, ctx)
            .await
            .expect("payment map")
    }

    #[tokio::test]
    async fn payment_map_has_core_fields() {
        let signer = test_signer();
        let map = build_map(
            "USDC",
            &test_ctx(),
            "5SoLaNaTxSignature000000000000000000000000",
        )
        .await;
        assert_eq!(map.get("scheme").map(String::as_str), Some("exact"));
        assert_eq!(
            map.get("network").map(String::as_str),
            Some("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
        );
        assert_eq!(map.get("asset").map(String::as_str), Some("USDC"));
        assert_eq!(map.get("amount").map(String::as_str), Some("10000000"));
        assert_eq!(
            map.get("from").map(String::as_str),
            Some(signer.agent_id().as_str())
        );
        assert_eq!(
            map.get("to").map(String::as_str),
            Some("FaciL1tatorBase58Recipient0000000000000000")
        );
        assert!(map.contains_key("nonce"));
        assert!(map.contains_key("expiresAt"));
        assert!(map.contains_key("signature"));
    }

    #[tokio::test]
    async fn on_chain_tx_in_references_not_signature() {
        let tx = "5SoLaNaTxSignature000000000000000000000000";
        let map = build_map("USDC", &test_ctx(), tx).await;
        // On-chain tx is carried as references, top-level and in signed metadata.
        assert_eq!(map.get("onChainTx").map(String::as_str), Some(tx));
        assert_eq!(map.get("tx").map(String::as_str), Some(tx));
        assert_eq!(map.get("transaction").map(String::as_str), Some(tx));
        // The `signature` field is the off-chain Ed25519 authorization sig — NOT
        // the on-chain tx signature.
        assert_ne!(map.get("signature").map(String::as_str), Some(tx));
        let sig = map.get("signature").expect("signature present");
        let raw = B64.decode(sig).expect("signature is base64");
        assert_eq!(raw.len(), 64, "Ed25519 signature is 64 bytes");
    }

    #[tokio::test]
    async fn purpose_and_extra_metadata_in_map() {
        let map = build_map(
            "USDC",
            &test_ctx(),
            "5SoLaNaTx000000000000000000000000000000000",
        )
        .await;
        assert_eq!(
            map.get("metadata.purpose").map(String::as_str),
            Some("identity.register")
        );
        assert_eq!(
            map.get("metadata.identity").map(String::as_str),
            Some("@tester")
        );
    }

    #[tokio::test]
    async fn nonce_prefix_used_when_challenge_nonce_absent() {
        // mock_challenge leaves nonce = None.
        let map = build_map(
            "USDC",
            &test_ctx(),
            "5SoLaNaTx000000000000000000000000000000000",
        )
        .await;
        let nonce = map.get("nonce").expect("nonce");
        assert!(nonce.starts_with("register_"), "got: {nonce}");
    }

    #[tokio::test]
    async fn challenge_nonce_preferred_when_present() {
        let signer = test_signer();
        let mut c = mock_challenge("USDC");
        c.nonce = Some("challenge-supplied-nonce".into());
        let v = validate_challenge(&c).unwrap();
        let map = build_payment_map(
            &signer,
            &v,
            "5SoLaNaTx000000000000000000000000000000000",
            &test_ctx(),
        )
        .await
        .unwrap();
        assert_eq!(
            map.get("nonce").map(String::as_str),
            Some("challenge-supplied-nonce")
        );
    }

    #[tokio::test]
    async fn signature_verifies_against_pubkey() {
        // Reconstruct the signed canonical message from the flattened map and
        // verify the authorization signature against the signer's public key —
        // exactly what the backend does.
        let tx = "5SoLaNaTxSignature000000000000000000000000";
        let map = build_map("USDC", &test_ctx(), tx).await;

        let metadata: HashMap<String, String> = map
            .iter()
            .filter_map(|(k, val)| {
                k.strip_prefix("metadata.")
                    .map(|kk| (kk.to_string(), val.clone()))
            })
            .collect();
        let fields = X402AuthorizationFields {
            scheme: map["scheme"].clone(),
            network: map["network"].clone(),
            asset: map["asset"].clone(),
            amount: map["amount"].clone(),
            from: map["from"].clone(),
            to: map["to"].clone(),
            nonce: map["nonce"].clone(),
            expires_at: map["expiresAt"].clone(),
            metadata: Some(metadata),
        };
        let canonical = build_canonical_message(&fields);

        let sig_bytes = B64.decode(&map["signature"]).expect("base64 signature");
        let signature = Signature::from_slice(&sig_bytes).expect("64-byte signature");
        let verifying_key = SigningKey::from_bytes(&TEST_SEED).verifying_key();

        verifying_key
            .verify(canonical.as_bytes(), &signature)
            .expect("authorization signature verifies over the canonical message");
    }
}
