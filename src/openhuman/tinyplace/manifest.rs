//! tiny.place command manifest — the **single source of truth** for which SDK
//! methods are wired into OpenHuman's JSON-RPC layer.
//!
//! ### Append-point convention
//!
//! The `// === AGENT-WORLD SECTION MANIFEST (append rows here) ===` banner is
//! the first append point for the six fan-out section agents. Adding a new
//! section = appending rows to [`tinyplace_handlers`] and adding the matching
//! schemas to [`all_tinyplace_controller_schemas`] in `schemas.rs`.
//!
//! ### Handler shape (uniform)
//!
//! Each handler:
//! 1. Deserialises params from a `Map<String, Value>`.
//! 2. Calls `ops::global_state().client().await?` to obtain the lazily-built
//!    [`tinyplace::TinyPlaceClient`].
//! 3. Calls the SDK method.
//! 4. Maps the error via `ops::map_err`.
//! 5. Serialises the result with `serde_json::to_value`.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{Map, Value};

use crate::core::all::ControllerFuture;
use crate::openhuman::tinyplace::ops::{global_state, map_err};
use crate::openhuman::tinyplace::payment::{
    ensure_cluster_matches, fulfill_payment, PaymentContext,
};
use crate::openhuman::wallet::{balances, WalletChain};

const LOG_PREFIX: &str = "[tinyplace]";

/// Identity registration settlement retry budget — the on-chain transfer is
/// broadcast immediately, but the backend may not see enough confirmations on
/// the first re-submit. Mirrors the TS SDK's poll loop (~60s total).
const REGISTER_SETTLE_MAX_ATTEMPTS: usize = 30;
const REGISTER_SETTLE_DELAY: Duration = Duration::from_secs(2);

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_value<T: serde::Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| format!("tinyplace serialise: {e}"))
}

fn get_opt_str<'a>(params: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    params.get(key).and_then(Value::as_str)
}

fn req_str<'a>(params: &'a Map<String, Value>, key: &str) -> Result<&'a str, String> {
    get_opt_str(params, key).ok_or_else(|| format!("missing required param '{key}'"))
}

// ── Handler implementations ───────────────────────────────────────────────────

// === AGENT-WORLD SECTION MANIFEST (append rows here) ===
// Each block = one `manifest row`. Format:
//   pub(crate) fn handle_tinyplace_<domain>_<method>(params: Map<String, Value>) -> ControllerFuture { … }
// The handler is then referenced in `schemas.rs` via all_tinyplace_registered_controllers().

// ── Directory: list_agents ────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_directory_list_agents(
    _params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        log::debug!("{LOG_PREFIX} directory_list_agents (raw passthrough)");
        let client = global_state().client().await?;
        // The SDK types AgentCardSummary.skills/tags as Vec<String>, but the backend
        // returns them as objects ({ id, name }) — so the SDK's typed list_agents()
        // fails to deserialize ("invalid type: map, expected a string"). Fetch the
        // raw JSON instead and let the renderer normalise the shape (its
        // getSkills/toLabel helpers already handle string-or-object). Query params
        // are unused by the current sections; add query support here if needed.
        let result: serde_json::Value = client
            .http()
            .get("/directory/agents", &[])
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Directory: get_agent ──────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_directory_get_agent(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let agent_id = req_str(&params, "agentId")?.to_string();
        log::debug!("{LOG_PREFIX} directory_get_agent agent_id={agent_id}");
        let client = global_state().client().await?;
        let result = client
            .directory
            .get_agent(&agent_id)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Directory: resolve ───────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_directory_resolve(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let name = req_str(&params, "name")?.to_string();
        log::debug!("{LOG_PREFIX} directory_resolve name={name}");
        let client = global_state().client().await?;
        let result = client.directory.resolve(&name).await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Directory: reverse ───────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_directory_reverse(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let crypto_id = req_str(&params, "cryptoId")?.to_string();
        log::debug!("{LOG_PREFIX} directory_reverse crypto_id={crypto_id}");
        let client = global_state().client().await?;
        let result = client
            .directory
            .reverse(&crypto_id)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Directory: list_identities ───────────────────────────────────────────────

pub(crate) fn handle_tinyplace_directory_list_identities(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} directory_list_identities params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::IdentityListingQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid directory list_identities params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .directory
            .list_identities(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Directory: skills ────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_directory_skills(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} directory_skills params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::api::directory::DirectorySkillsParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid directory skills params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .directory
            .skills(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Explorer: overview ────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_explorer_overview(_params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!("{LOG_PREFIX} explorer_overview");
        let client = global_state().client().await?;
        let result = client.explorer.overview().await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Search: unified ───────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_search_unified(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let query = req_str(&params, "query")?.to_string();
        log::debug!("{LOG_PREFIX} search_unified query={query}");
        let client = global_state().client().await?;
        let result = client.search.unified(&query).await.map_err(map_err)?;
        to_value(result)
    })
}

// === AGENT-WORLD SECTION MANIFEST (append rows here) ===
// Each block = one `manifest row`. Format:
//   pub(crate) fn handle_tinyplace_<domain>_<method>(params: Map<String, Value>) -> ControllerFuture { … }
// The handler is then referenced in `schemas.rs` via all_tinyplace_registered_controllers().

// ── Profiles: get ────────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_profiles_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.to_string();
        log::debug!("{LOG_PREFIX} profiles_get username={username}");
        let client = global_state().client().await?;
        let result = client.profiles.get(&username).await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Profiles: activity ───────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_profiles_activity(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.to_string();
        log::debug!("{LOG_PREFIX} profiles_activity username={username}");
        let client = global_state().client().await?;
        let result = client.profiles.activity(&username).await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Profiles: groups ─────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_profiles_groups(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.to_string();
        log::debug!("{LOG_PREFIX} profiles_groups username={username}");
        let client = global_state().client().await?;
        let result = client.profiles.groups(&username).await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Profiles: broadcasts ─────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_profiles_broadcasts(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.to_string();
        log::debug!("{LOG_PREFIX} profiles_broadcasts username={username}");
        let client = global_state().client().await?;
        let result = client
            .profiles
            .broadcasts(&username)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Profiles: attestations ───────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_profiles_attestations(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.to_string();
        log::debug!("{LOG_PREFIX} profiles_attestations username={username}");
        let client = global_state().client().await?;
        let result = client
            .profiles
            .attestations(&username)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Profiles: agent_card ─────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_profiles_agent_card(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.to_string();
        log::debug!("{LOG_PREFIX} profiles_agent_card username={username}");
        let client = global_state().client().await?;
        let result = client
            .profiles
            .agent_card(&username)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

// ── Users: get ───────────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_users_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let crypto_id = req_str(&params, "cryptoId")?.to_string();
        log::debug!("{LOG_PREFIX} users_get crypto_id={crypto_id}");
        let client = global_state().client().await?;
        let result = client.users.get(&crypto_id).await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Users: update_profile ────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_users_update_profile(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let crypto_id = req_str(&params, "cryptoId")?.to_string();
        let update_value = params.get("update").cloned().unwrap_or(Value::Null);
        let update: tinyplace::types::UserProfileUpdate = serde_json::from_value(update_value)
            .map_err(|e| format!("invalid users update_profile params: {e}"))?;
        log::debug!("{LOG_PREFIX} users_update_profile crypto_id={crypto_id}");
        let client = global_state().client().await?;
        let result = client
            .users
            .update_profile(&crypto_id, update)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_marketplace_identity_floor(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let length = params.get("length").and_then(Value::as_i64);
        log::debug!("{LOG_PREFIX} marketplace_identity_floor length={length:?}");
        let client = global_state().client().await?;
        // IdentityFloor derives Serialize via the types module.
        let result = client
            .marketplace
            .identity_floor(length)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_marketplace_identity_sale_history(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let name = req_str(&params, "name")?.to_string();
        log::debug!("{LOG_PREFIX} marketplace_identity_sale_history name={name}");
        let client = global_state().client().await?;
        // IdentitySaleHistoryResponse only derives Deserialize; serialize the inner vec.
        let result = client
            .marketplace
            .identity_sale_history(&name)
            .await
            .map_err(map_err)?;
        let history = to_value(result.history)?;
        Ok(serde_json::json!({ "history": history }))
    })
}

pub(crate) fn handle_tinyplace_marketplace_list_bids(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let listing_id = req_str(&params, "listingId")?.to_string();
        log::debug!("{LOG_PREFIX} marketplace_list_bids listing_id={listing_id}");
        let client = global_state().client().await?;
        // BidsResponse only derives Deserialize; serialize the inner vec.
        let result = client
            .marketplace
            .list_bids(&listing_id)
            .await
            .map_err(map_err)?;
        let bids = to_value(result.bids)?;
        Ok(serde_json::json!({ "bids": bids }))
    })
}

pub(crate) fn handle_tinyplace_marketplace_list_identities(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let limit = params.get("limit").and_then(Value::as_i64);
        let status = get_opt_str(&params, "status").map(str::to_string);
        log::debug!("{LOG_PREFIX} marketplace_list_identities limit={limit:?} status={status:?}");
        let client = global_state().client().await?;
        // IdentitiesResponse only derives Deserialize; serialize the inner vec.
        let result = client
            .marketplace
            .list_identities(limit, status.as_deref())
            .await
            .map_err(map_err)?;
        let identities = to_value(result.identities)?;
        Ok(serde_json::json!({ "identities": identities }))
    })
}

pub(crate) fn handle_tinyplace_marketplace_list_offers(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let name = get_opt_str(&params, "name").map(str::to_string);
        let buyer = get_opt_str(&params, "buyer").map(str::to_string);
        log::debug!("{LOG_PREFIX} marketplace_list_offers name={name:?} buyer={buyer:?}");
        let client = global_state().client().await?;
        use tinyplace::api::marketplace::OfferQueryParams;
        let query_params = OfferQueryParams {
            name,
            buyer,
            ..Default::default()
        };
        // OffersResponse only derives Deserialize; serialize the inner vec.
        let result = client
            .marketplace
            .list_offers(Some(&query_params))
            .await
            .map_err(map_err)?;
        let offers = to_value(result.offers)?;
        Ok(serde_json::json!({ "offers": offers }))
    })
}

pub(crate) fn handle_tinyplace_marketplace_recent(_params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!("{LOG_PREFIX} marketplace_recent");
        let client = global_state().client().await?;
        // RecentSalesResponse only derives Deserialize; serialize the inner vec.
        let result = client.marketplace.recent().await.map_err(map_err)?;
        let sales = to_value(result.sales)?;
        Ok(serde_json::json!({ "sales": sales }))
    })
}

pub(crate) fn handle_tinyplace_registry_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let name = req_str(&params, "name")?.to_string();
        log::debug!("{LOG_PREFIX} registry_get name={name}");
        let client = global_state().client().await?;
        let result = client.registry.get(&name).await.map_err(map_err)?;
        to_value(result)
    })
}

/// Register a `@handle` via the x402 confirm-before-spend flow.
///
/// Two-call contract (the renderer drives it):
/// - `confirmed` omitted/false → returns the 402 `challenge` plus the wallet's
///   USDC balance + address so the UI can render a confirm card. **No funds move.**
/// - `confirmed: true` → fulfils the payment on-chain (devnet-guarded) and
///   re-submits the registration with the signed payment map, retrying while the
///   settlement confirms. **This is the only branch that spends.**
///
/// The free tier (backend returns the identity without a 402) short-circuits to
/// `{ identity }` on the first call regardless of `confirmed`.
pub(crate) fn handle_tinyplace_registry_register(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let username = req_str(&params, "username")?.trim().to_string();
        if username.is_empty() {
            return Err("missing required param 'username'".to_string());
        }
        let confirmed = params
            .get("confirmed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let actor_type = get_opt_str(&params, "actorType")
            .filter(|s| !s.is_empty())
            .unwrap_or("human")
            .to_string();
        let primary = params.get("primary").and_then(Value::as_bool);
        log::debug!(
            "{LOG_PREFIX} registry_register username={username} confirmed={confirmed} \
             actor_type={actor_type} primary={primary:?}"
        );

        let client = global_state().client().await?;
        let signer = client
            .http()
            .signer()
            .ok_or("tiny.place signer unavailable; unlock your wallet")?;

        // payment = None on the probe call so the backend issues the 402.
        let base_req = tinyplace::api::registry::RegisterRequest {
            username: username.clone(),
            crypto_id: signer.agent_id(),
            public_key: signer.public_key_base64(),
            actor_type: Some(actor_type),
            primary,
            ..Default::default()
        };

        // ── Phase A: probe for the 402 challenge (or a free-tier identity). ──
        let challenge = match client.registry.register(base_req.clone()).await {
            Ok(identity) => {
                log::debug!("{LOG_PREFIX} registry_register free-tier ok username={username}");
                return to_value(serde_json::json!({ "identity": identity }));
            }
            Err(e) => match e.payment_required() {
                Some(pr) => pr.payment.clone(),
                None => return Err(map_err(e)),
            },
        };
        log::debug!(
            "{LOG_PREFIX} registry_register 402 challenge network={:?} asset={:?} amount={:?}",
            challenge.network,
            challenge.asset,
            challenge.amount,
        );

        // ── Unconfirmed: surface the challenge + balance, spend nothing. ──
        if !confirmed {
            let (wallet_balance, wallet_address) = wallet_usdc_balance(&signer.agent_id()).await;
            return to_value(serde_json::json!({
                "challenge": challenge,
                "walletBalance": wallet_balance,
                "walletAddress": wallet_address,
            }));
        }

        // ── Confirmed: devnet guard, pay on-chain, re-submit with the map. ──
        if let Some(network) = challenge.network.as_deref() {
            ensure_cluster_matches(network)?;
        }

        let mut extra_metadata = HashMap::new();
        extra_metadata.insert("identity".to_string(), format!("@{username}"));
        let fulfilled = fulfill_payment(
            &challenge,
            signer.as_ref(),
            PaymentContext {
                purpose: "identity.register".to_string(),
                nonce_prefix: "register".to_string(),
                extra_metadata,
            },
        )
        .await?;
        let on_chain_tx = fulfilled.on_chain_tx.clone();

        let mut paid_req = base_req;
        paid_req.payment = Some(fulfilled.payment_map);

        // Re-submit, retrying while the settlement confirms on-chain.
        let mut last_err = String::new();
        for attempt in 1..=REGISTER_SETTLE_MAX_ATTEMPTS {
            match client.registry.register(paid_req.clone()).await {
                Ok(identity) => {
                    log::debug!(
                        "{LOG_PREFIX} registry_register settled username={username} attempt={attempt}"
                    );
                    return to_value(serde_json::json!({
                        "identity": identity,
                        "payment": { "onChainTx": on_chain_tx },
                    }));
                }
                Err(e) if is_retryable_settlement_error(&e) => {
                    last_err = e.to_string();
                    log::debug!(
                        "{LOG_PREFIX} registry_register settlement pending \
                         attempt={attempt}/{REGISTER_SETTLE_MAX_ATTEMPTS}: {last_err}"
                    );
                    tokio::time::sleep(REGISTER_SETTLE_DELAY).await;
                }
                Err(e) => {
                    // Non-retryable failure after we already paid — surface the
                    // tx so the user/support can reconcile.
                    return Err(format!(
                        "registration failed after payment (onChainTx={on_chain_tx}): {}",
                        map_err(e)
                    ));
                }
            }
        }

        // ── Exhausted retries: recover via a fresh availability lookup. ──
        log::warn!(
            "{LOG_PREFIX} registry_register settlement retries exhausted username={username} \
             onChainTx={on_chain_tx}; attempting recovery via registry.get"
        );
        if let Ok(avail) = client.registry.get(&username).await {
            if let Some(identity) = avail.identity {
                if identity.crypto_id == signer.agent_id() {
                    log::debug!(
                        "{LOG_PREFIX} registry_register recovered owned identity username={username}"
                    );
                    return to_value(serde_json::json!({
                        "identity": identity,
                        "payment": { "onChainTx": on_chain_tx },
                    }));
                }
            }
        }
        Err(format!(
            "registration paid but not confirmed in time (onChainTx={on_chain_tx}); \
             last error: {last_err}"
        ))
    })
}

/// Fetch the wallet's Solana USDC balance for the confirm card. Best-effort:
/// returns `(None, address)` if the balance lookup fails so the UI can still
/// render (it falls back to letting the backend reject an underfunded payment).
async fn wallet_usdc_balance(address: &str) -> (Option<Value>, String) {
    match balances().await {
        Ok(outcome) => {
            let row = outcome
                .value
                .into_iter()
                .find(|b| b.chain == WalletChain::Solana && b.asset_symbol == "USDC");
            match row {
                Some(b) => (
                    Some(serde_json::json!({
                        "raw": b.raw,
                        "formatted": b.formatted,
                        "decimals": b.decimals,
                        "assetSymbol": b.asset_symbol,
                    })),
                    b.address,
                ),
                None => (None, address.to_string()),
            }
        }
        Err(e) => {
            log::warn!("{LOG_PREFIX} registry_register balance lookup failed: {e}");
            (None, address.to_string())
        }
    }
}

/// A re-submitted registration returns a 402 again while the on-chain transfer
/// is still confirming. Retry only those settlement-timing errors — never a hard
/// rejection (which would loop pointlessly and delay the failure).
fn is_retryable_settlement_error(e: &tinyplace::Error) -> bool {
    let mut hay = e.to_string();
    if let Some(pr) = e.payment_required() {
        if let Some(msg) = &pr.error {
            hay.push_str(msg);
        }
    }
    if let Some(body) = e.body() {
        hay.push_str(&body.to_string());
    }
    settlement_error_is_retryable(e.status(), &hay)
}

/// Pure settlement-retry decision (no SDK error type — unit-tested directly).
/// Only a `402` whose message indicates the on-chain transfer is still
/// confirming is retryable.
fn settlement_error_is_retryable(status: Option<u16>, message: &str) -> bool {
    if status != Some(402) {
        return false;
    }
    let hay = message.to_lowercase();
    hay.contains("transaction not found")
        || hay.contains("not found")
        || hay.contains("insufficient confirmation")
        || hay.contains("not yet")
        || hay.contains("pending")
}

// ── Marketplace buy (x402) ─────────────────────────────────────────────────────

/// Outcome of a post-payment re-submit loop that could not return a result.
enum SettleFailure {
    /// A hard, non-retryable backend rejection (already mapped to a string).
    Hard(String),
    /// The settlement never confirmed within the retry budget.
    Exhausted(String),
}

/// Re-submit a paid domain request, retrying only while the on-chain settlement
/// confirms (a `402` with a settlement-timing message). Shared by buy/bid/offer.
async fn settle_retry<F, Fut, T>(label: &str, mut submit: F) -> Result<T, SettleFailure>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, tinyplace::Error>>,
{
    let mut last_err = String::new();
    for attempt in 1..=REGISTER_SETTLE_MAX_ATTEMPTS {
        match submit().await {
            Ok(value) => return Ok(value),
            Err(e) if is_retryable_settlement_error(&e) => {
                last_err = e.to_string();
                log::debug!(
                    "{LOG_PREFIX} {label} settlement pending \
                     attempt={attempt}/{REGISTER_SETTLE_MAX_ATTEMPTS}: {last_err}"
                );
                tokio::time::sleep(REGISTER_SETTLE_DELAY).await;
            }
            Err(e) => return Err(SettleFailure::Hard(map_err(e))),
        }
    }
    Err(SettleFailure::Exhausted(last_err))
}

/// Buy a marketplace product via the x402 confirm-before-spend flow.
///
/// Params `{ id, confirmed? }`. `confirmed:false` → `{ challenge, walletBalance,
/// walletAddress }` (no spend). `confirmed:true` → pays on-chain and completes
/// the purchase, returning `{ result, payment: { onChainTx } }`.
pub(crate) fn handle_tinyplace_marketplace_buy_product(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let product_id = req_str(&params, "id")?.trim().to_string();
        if product_id.is_empty() {
            return Err("missing required param 'id'".to_string());
        }
        let confirmed = params
            .get("confirmed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        log::debug!("{LOG_PREFIX} marketplace_buy_product id={product_id} confirmed={confirmed}");

        let client = global_state().client().await?;
        let signer = client
            .http()
            .signer()
            .ok_or("tiny.place signer unavailable; unlock your wallet")?;

        let base_req = tinyplace::types::ProductBuyRequest {
            buyer_crypto_id: Some(signer.agent_id()),
            ..Default::default()
        };

        let challenge = match client
            .marketplace
            .buy_product(&product_id, base_req.clone())
            .await
        {
            Ok(purchase) => return to_value(serde_json::json!({ "result": purchase })),
            Err(e) => match e.payment_required() {
                Some(pr) => pr.payment.clone(),
                None => return Err(map_err(e)),
            },
        };

        if !confirmed {
            let (wallet_balance, wallet_address) = wallet_usdc_balance(&signer.agent_id()).await;
            return to_value(serde_json::json!({
                "challenge": challenge,
                "walletBalance": wallet_balance,
                "walletAddress": wallet_address,
            }));
        }

        if let Some(network) = challenge.network.as_deref() {
            ensure_cluster_matches(network)?;
        }
        let mut extra_metadata = HashMap::new();
        extra_metadata.insert("productId".to_string(), product_id.clone());
        let fulfilled = fulfill_payment(
            &challenge,
            signer.as_ref(),
            PaymentContext {
                purpose: "marketplace.buy_product".to_string(),
                nonce_prefix: "buy".to_string(),
                extra_metadata,
            },
        )
        .await?;
        let on_chain_tx = fulfilled.on_chain_tx.clone();

        let mut paid_req = base_req;
        paid_req.payment = Some(fulfilled.payment_map);
        match settle_retry("buy_product", || {
            client
                .marketplace
                .buy_product(&product_id, paid_req.clone())
        })
        .await
        {
            Ok(purchase) => to_value(serde_json::json!({
                "result": purchase,
                "payment": { "onChainTx": on_chain_tx },
            })),
            Err(SettleFailure::Hard(m)) => Err(format!(
                "purchase failed after payment (onChainTx={on_chain_tx}): {m}"
            )),
            Err(SettleFailure::Exhausted(last)) => Err(format!(
                "purchase paid but not confirmed in time (onChainTx={on_chain_tx}); \
                 last error: {last}"
            )),
        }
    })
}

/// Buy an identity listing (a `@handle` at its fixed price) via the same x402
/// confirm-before-spend flow. Params `{ id, confirmed? }` where `id` is the
/// listing id.
pub(crate) fn handle_tinyplace_marketplace_buy_identity(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let listing_id = req_str(&params, "id")?.trim().to_string();
        if listing_id.is_empty() {
            return Err("missing required param 'id'".to_string());
        }
        let confirmed = params
            .get("confirmed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        log::debug!("{LOG_PREFIX} marketplace_buy_identity id={listing_id} confirmed={confirmed}");

        let client = global_state().client().await?;
        let signer = client
            .http()
            .signer()
            .ok_or("tiny.place signer unavailable; unlock your wallet")?;

        // buyer left empty → the connected signing key is the actor; the SDK
        // auto-signs the canonical identity.buy payload.
        let base_req = tinyplace::types::IdentityBuyRequest {
            buyer: String::new(),
            buyer_crypto_id: signer.agent_id(),
            buyer_public_key: Some(signer.public_key_base64()),
            ..Default::default()
        };

        let challenge = match client
            .marketplace
            .buy_identity_listing(&listing_id, base_req.clone())
            .await
        {
            Ok(sale) => return to_value(serde_json::json!({ "result": sale })),
            Err(e) => match e.payment_required() {
                Some(pr) => pr.payment.clone(),
                None => return Err(map_err(e)),
            },
        };

        if !confirmed {
            let (wallet_balance, wallet_address) = wallet_usdc_balance(&signer.agent_id()).await;
            return to_value(serde_json::json!({
                "challenge": challenge,
                "walletBalance": wallet_balance,
                "walletAddress": wallet_address,
            }));
        }

        if let Some(network) = challenge.network.as_deref() {
            ensure_cluster_matches(network)?;
        }
        let mut extra_metadata = HashMap::new();
        extra_metadata.insert("listingId".to_string(), listing_id.clone());
        let fulfilled = fulfill_payment(
            &challenge,
            signer.as_ref(),
            PaymentContext {
                purpose: "marketplace.buy_identity".to_string(),
                nonce_prefix: "buy".to_string(),
                extra_metadata,
            },
        )
        .await?;
        let on_chain_tx = fulfilled.on_chain_tx.clone();

        // The signed payload depends on request fields; clearing the stale
        // signature lets the SDK re-sign with the payment attached.
        let mut paid_req = base_req;
        paid_req.payment = Some(fulfilled.payment_map);
        paid_req.signature = None;
        match settle_retry("buy_identity", || {
            client
                .marketplace
                .buy_identity_listing(&listing_id, paid_req.clone())
        })
        .await
        {
            Ok(sale) => to_value(serde_json::json!({
                "result": sale,
                "payment": { "onChainTx": on_chain_tx },
            })),
            Err(SettleFailure::Hard(m)) => Err(format!(
                "purchase failed after payment (onChainTx={on_chain_tx}): {m}"
            )),
            Err(SettleFailure::Exhausted(last)) => Err(format!(
                "purchase paid but not confirmed in time (onChainTx={on_chain_tx}); \
                 last error: {last}"
            )),
        }
    })
}

// ── Marketplace bid / offer (x402 commitments) ─────────────────────────────────

/// Build a [`tinyplace::types::MarketplacePrice`] from params. `network` is
/// required (the renderer passes the listing's price network so the x402
/// authorization targets the right chain); `asset` defaults to USDC.
fn price_from_params(
    params: &Map<String, Value>,
) -> Result<tinyplace::types::MarketplacePrice, String> {
    let amount = req_str(params, "amount")?.trim().to_string();
    if amount.is_empty() {
        return Err("missing required param 'amount'".to_string());
    }
    let asset = get_opt_str(params, "asset")
        .filter(|s| !s.is_empty())
        .unwrap_or("USDC")
        .to_string();
    let network = req_str(params, "network")?.trim().to_string();
    if network.is_empty() {
        return Err("missing required param 'network'".to_string());
    }
    Ok(tinyplace::types::MarketplacePrice {
        amount,
        asset,
        network,
    })
}

/// Place a bid on an identity auction listing. The SDK builds and signs the
/// x402 authorization (an "up-to" commitment) internally — **no on-chain
/// transfer happens here**; the bid settles on acceptance. May 402 if the
/// backend requires a deposit (surfaced as PAYMENT_REQUIRED to the renderer).
///
/// Params `{ listingId, amount, asset?, network }`.
pub(crate) fn handle_tinyplace_marketplace_bid(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let listing_id = req_str(&params, "listingId")?.trim().to_string();
        if listing_id.is_empty() {
            return Err("missing required param 'listingId'".to_string());
        }
        let price = price_from_params(&params)?;
        log::debug!(
            "{LOG_PREFIX} marketplace_bid listing_id={listing_id} amount={} asset={} network={}",
            price.amount,
            price.asset,
            price.network,
        );

        let client = global_state().client().await?;
        let signer = client
            .http()
            .signer()
            .ok_or("tiny.place signer unavailable; unlock your wallet")?;

        let bid = tinyplace::types::IdentityBid {
            bidder: Some(signer.agent_id()),
            bidder_crypto_id: Some(signer.agent_id()),
            bidder_public_key: Some(signer.public_key_base64()),
            price: Some(price),
            ..Default::default()
        };
        let result = client
            .marketplace
            .place_bid_with_payment(
                &listing_id,
                bid,
                tinyplace::api::marketplace::IdentityBidPaymentOptions::default(),
            )
            .await
            .map_err(map_err)?;

        // Return the updated listing only — never the raw signed authorization map.
        to_value(serde_json::json!({
            "result": result.updated_listing,
            "committed": true,
        }))
    })
}

/// Make an offer to buy an identity (`@handle`) at a chosen price. Like bids,
/// the SDK builds and signs the x402 authorization internally — **no on-chain
/// transfer here**; the offer settles on acceptance.
///
/// Params `{ name, amount, asset?, network }`.
pub(crate) fn handle_tinyplace_marketplace_offer(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let name = req_str(&params, "name")?.trim().to_string();
        if name.is_empty() {
            return Err("missing required param 'name'".to_string());
        }
        let price = price_from_params(&params)?;
        log::debug!(
            "{LOG_PREFIX} marketplace_offer name={name} amount={} asset={} network={}",
            price.amount,
            price.asset,
            price.network,
        );

        let client = global_state().client().await?;
        let signer = client
            .http()
            .signer()
            .ok_or("tiny.place signer unavailable; unlock your wallet")?;

        let offer = tinyplace::types::IdentityOffer {
            name: Some(name),
            buyer: Some(signer.agent_id()),
            buyer_crypto_id: Some(signer.agent_id()),
            buyer_public_key: Some(signer.public_key_base64()),
            price: Some(price),
            ..Default::default()
        };
        let result = client
            .marketplace
            .create_offer_with_payment(
                offer,
                tinyplace::api::marketplace::IdentityOfferPaymentOptions::default(),
            )
            .await
            .map_err(map_err)?;

        to_value(serde_json::json!({
            "result": result.offer,
            "committed": true,
        }))
    })
}

pub(crate) fn handle_tinyplace_artifacts_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let artifact_id = req_str(&params, "artifactId")?.to_string();
        let actor_id = get_opt_str(&params, "actorId").map(str::to_string);
        log::debug!("{LOG_PREFIX} artifacts_get artifact_id={artifact_id} actor_id={actor_id:?}");
        let client = global_state().client().await?;
        let result = client
            .artifacts
            .get(&artifact_id, actor_id.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_artifacts_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} artifacts_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::ArtifactQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid artifacts list params: {e}"))
            })
            .transpose()?;
        let actor_id = get_opt_str(&params, "actorId").map(str::to_string);

        let client = global_state().client().await?;
        let result = client
            .artifacts
            .list(query_params.as_ref(), actor_id.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_escrow_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let escrow_id = req_str(&params, "escrowId")?.to_string();
        log::debug!("{LOG_PREFIX} escrow_get escrow_id={escrow_id}");
        let client = global_state().client().await?;
        let result = client.escrow.get(&escrow_id).await.map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_escrow_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} escrow_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::EscrowQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid escrow list params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .escrow
            .list(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_jobs_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let job_id = req_str(&params, "jobId")?.to_string();
        log::debug!("{LOG_PREFIX} jobs_get job_id={job_id}");
        let client = global_state().client().await?;
        let result = client.jobs.get(&job_id).await.map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_jobs_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} jobs_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::JobQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid jobs list params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .jobs
            .list(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_marketplace_browse(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} marketplace_browse params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::ProductQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid marketplace browse params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .marketplace
            .browse_marketplace(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_marketplace_categories(
    _params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        log::debug!("{LOG_PREFIX} marketplace_categories");
        let client = global_state().client().await?;
        let result = client.marketplace.categories().await.map_err(map_err)?;
        to_value(CategoriesWrapper {
            categories: result.categories,
        })
    })
}

pub(crate) fn handle_tinyplace_marketplace_featured(
    _params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        log::debug!("{LOG_PREFIX} marketplace_featured");
        let client = global_state().client().await?;
        let result = client.marketplace.featured().await.map_err(map_err)?;
        to_value(FeaturedWrapper {
            items: result.items,
        })
    })
}

pub(crate) fn handle_tinyplace_marketplace_get_product(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let product_id = req_str(&params, "productId")?.to_string();
        log::debug!("{LOG_PREFIX} marketplace_get_product product_id={product_id}");
        let client = global_state().client().await?;
        let result = client
            .marketplace
            .get_product(&product_id)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_marketplace_list_product_reviews(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let product_id = req_str(&params, "productId")?.to_string();
        log::debug!("{LOG_PREFIX} marketplace_list_product_reviews product_id={product_id}");
        let client = global_state().client().await?;
        let result = client
            .marketplace
            .list_product_reviews(&product_id)
            .await
            .map_err(map_err)?;
        to_value(ProductReviewsWrapper {
            reviews: result.reviews,
        })
    })
}

pub(crate) fn handle_tinyplace_marketplace_list_products(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} marketplace_list_products params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::ProductQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid marketplace list_products params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .marketplace
            .list_products(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(ProductsWrapper {
            products: result.products,
        })
    })
}

// Serialize wrappers for marketplace responses (from #5).
#[derive(serde::Serialize)]
struct ProductsWrapper {
    products: Vec<tinyplace::types::Product>,
}

#[derive(serde::Serialize)]
struct CategoriesWrapper {
    categories: Vec<tinyplace::types::MarketplaceCategory>,
}

#[derive(serde::Serialize)]
struct FeaturedWrapper {
    items: Vec<serde_json::Value>,
}

#[derive(serde::Serialize)]
struct ProductReviewsWrapper {
    reviews: Vec<tinyplace::types::ProductReview>,
}

pub(crate) fn handle_tinyplace_broadcasts_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} broadcasts_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::BroadcastQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid broadcasts list params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .broadcasts
            .list(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_channels_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} channels_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::api::channels::ChannelQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid channels list params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .channels
            .list(query_params.as_ref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_groups_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} groups_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::types::GroupQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid groups list params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .groups
            .list(query_params.as_ref())
            .await
            .map_err(map_err)?;
        // GroupListResponse doesn't implement Serialize; serialize its inner vec.
        to_value(result.groups)
    })
}

pub(crate) fn handle_tinyplace_inbox_counts(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let owner: Option<String> = params
            .get("owner")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        log::debug!("{LOG_PREFIX} inbox_counts owner={owner:?}");

        let client = global_state().client().await?;
        let result = client
            .inbox
            .counts(owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_inbox_list(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} inbox_list params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        let query_params: Option<tinyplace::api::inbox::InboxQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid inbox list params: {e}"))
            })
            .transpose()?;
        let owner: Option<String> = params
            .get("owner")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let client = global_state().client().await?;
        let result = client
            .inbox
            .list(query_params.as_ref(), owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

fn opt_owner(params: &Map<String, Value>) -> Option<String> {
    params
        .get("owner")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub(crate) fn handle_tinyplace_broadcasts_subscribe(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let broadcast_id = req_str(&params, "broadcastId")?.to_string();
        log::debug!("{LOG_PREFIX} broadcasts_subscribe broadcast_id={broadcast_id}");
        let client = global_state().client().await?;
        let result = client
            .broadcasts
            .subscribe(&broadcast_id, None)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_broadcasts_unsubscribe(
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        let broadcast_id = req_str(&params, "broadcastId")?.to_string();
        log::debug!("{LOG_PREFIX} broadcasts_unsubscribe broadcast_id={broadcast_id}");
        let client = global_state().client().await?;
        client
            .broadcasts
            .unsubscribe(&broadcast_id, None)
            .await
            .map_err(map_err)?;
        to_value(serde_json::json!({ "ok": true }))
    })
}

pub(crate) fn handle_tinyplace_channels_join(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let channel_id = req_str(&params, "channelId")?.to_string();
        log::debug!("{LOG_PREFIX} channels_join channel_id={channel_id}");
        let client = global_state().client().await?;
        let result = client
            .channels
            .join(&channel_id, None)
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_channels_leave(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let channel_id = req_str(&params, "channelId")?.to_string();
        log::debug!("{LOG_PREFIX} channels_leave channel_id={channel_id}");
        let client = global_state().client().await?;
        client
            .channels
            .leave(&channel_id, None)
            .await
            .map_err(map_err)?;
        to_value(serde_json::json!({ "ok": true }))
    })
}

pub(crate) fn handle_tinyplace_groups_join(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let group_id = req_str(&params, "groupId")?.to_string();
        log::debug!("{LOG_PREFIX} groups_join group_id={group_id}");
        let client = global_state().client().await?;
        let result = client.groups.join(&group_id, None).await.map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_groups_leave(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        use tinyplace::Signer as _;
        let group_id = req_str(&params, "groupId")?.to_string();
        log::debug!("{LOG_PREFIX} groups_leave group_id={group_id}");
        let client = global_state().client().await?;
        // Leaving = removing ourselves; the SDK exposes no `groups.leave`.
        let me = client
            .http()
            .signer()
            .map(|s| s.agent_id())
            .ok_or_else(|| "tinyplace signer unavailable; cannot leave group".to_string())?;
        client
            .groups
            .remove_member(&group_id, &me, None)
            .await
            .map_err(map_err)?;
        to_value(serde_json::json!({ "ok": true }))
    })
}

pub(crate) fn handle_tinyplace_inbox_archive(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let item_id = req_str(&params, "itemId")?.to_string();
        let owner = opt_owner(&params);
        log::debug!("{LOG_PREFIX} inbox_archive item_id={item_id} owner={owner:?}");
        let client = global_state().client().await?;
        let result = client
            .inbox
            .archive(&item_id, owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_inbox_mark_all_read(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let clear_params: Option<tinyplace::api::inbox::InboxClearParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid inbox mark_all_read params: {e}"))
            })
            .transpose()?;
        let owner = opt_owner(&params);
        log::debug!("{LOG_PREFIX} inbox_mark_all_read owner={owner:?}");
        let client = global_state().client().await?;
        let result = client
            .inbox
            .mark_all_read(clear_params.as_ref(), owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_inbox_mark_read(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let item_id = req_str(&params, "itemId")?.to_string();
        let owner = opt_owner(&params);
        log::debug!("{LOG_PREFIX} inbox_mark_read item_id={item_id} owner={owner:?}");
        let client = global_state().client().await?;
        let result = client
            .inbox
            .mark_read(&item_id, owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

pub(crate) fn handle_tinyplace_inbox_remove(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let item_id = req_str(&params, "itemId")?.to_string();
        let owner = opt_owner(&params);
        log::debug!("{LOG_PREFIX} inbox_remove item_id={item_id} owner={owner:?}");
        let client = global_state().client().await?;
        client
            .inbox
            .remove(&item_id, owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(serde_json::json!({ "ok": true }))
    })
}

pub(crate) fn handle_tinyplace_inbox_unarchive(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let item_id = req_str(&params, "itemId")?.to_string();
        let owner = opt_owner(&params);
        log::debug!("{LOG_PREFIX} inbox_unarchive item_id={item_id} owner={owner:?}");
        let client = global_state().client().await?;
        let result = client
            .inbox
            .unarchive(&item_id, owner.as_deref())
            .await
            .map_err(map_err)?;
        to_value(result)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::executor::block_on;

    /// A missing/blank `username` is rejected before any client/network work.
    #[test]
    fn register_requires_username() {
        let err = block_on(handle_tinyplace_registry_register(Map::new())).unwrap_err();
        assert!(err.contains("username"), "got: {err}");

        let mut params = Map::new();
        params.insert("username".to_string(), Value::String("   ".to_string()));
        let err = block_on(handle_tinyplace_registry_register(params)).unwrap_err();
        assert!(err.contains("username"), "got: {err}");
    }

    /// Buy handlers reject a missing/blank `id` before any client/network work.
    #[test]
    fn buy_handlers_require_id() {
        for handler in [
            handle_tinyplace_marketplace_buy_product as fn(Map<String, Value>) -> ControllerFuture,
            handle_tinyplace_marketplace_buy_identity,
        ] {
            let err = block_on(handler(Map::new())).unwrap_err();
            assert!(err.contains("'id'"), "got: {err}");

            let mut params = Map::new();
            params.insert("id".to_string(), Value::String("  ".to_string()));
            let err = block_on(handler(params)).unwrap_err();
            assert!(err.contains("'id'"), "got: {err}");
        }
    }

    /// Bid/offer handlers validate their required params before any network work.
    #[test]
    fn bid_offer_validate_params() {
        // bid: missing listingId.
        let err = block_on(handle_tinyplace_marketplace_bid(Map::new())).unwrap_err();
        assert!(err.contains("listingId"), "got: {err}");
        // bid: listingId present but amount missing.
        let mut p = Map::new();
        p.insert("listingId".to_string(), Value::String("l1".into()));
        let err = block_on(handle_tinyplace_marketplace_bid(p)).unwrap_err();
        assert!(err.contains("amount"), "got: {err}");
        // offer: missing name.
        let err = block_on(handle_tinyplace_marketplace_offer(Map::new())).unwrap_err();
        assert!(err.contains("name"), "got: {err}");
    }

    #[test]
    fn price_from_params_defaults_asset_and_requires_network() {
        let mut p = Map::new();
        p.insert("amount".to_string(), Value::String("100".into()));
        // network missing → Err.
        assert!(price_from_params(&p).unwrap_err().contains("network"));
        // network present → defaults asset to USDC.
        p.insert("network".to_string(), Value::String("solana-devnet".into()));
        let price = price_from_params(&p).unwrap();
        assert_eq!(price.amount, "100");
        assert_eq!(price.asset, "USDC");
        assert_eq!(price.network, "solana-devnet");
        // explicit asset is honoured.
        p.insert("asset".to_string(), Value::String("SOL".into()));
        assert_eq!(price_from_params(&p).unwrap().asset, "SOL");
    }

    #[test]
    fn settlement_retry_only_on_confirming_402s() {
        // Retryable: 402 with a settlement-timing message.
        assert!(settlement_error_is_retryable(
            Some(402),
            "Transaction not found on chain yet"
        ));
        assert!(settlement_error_is_retryable(
            Some(402),
            "payment pending: insufficient confirmations"
        ));
        // Not retryable: non-402, or a 402 with an unrelated/hard message.
        assert!(!settlement_error_is_retryable(
            Some(400),
            "transaction not found"
        ));
        assert!(!settlement_error_is_retryable(
            Some(402),
            "handle already taken"
        ));
        assert!(!settlement_error_is_retryable(None, "transport error"));
    }
}
