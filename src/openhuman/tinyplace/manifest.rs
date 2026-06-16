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

use serde_json::{Map, Value};

use crate::core::all::ControllerFuture;
use crate::openhuman::tinyplace::ops::{global_state, map_err};

const LOG_PREFIX: &str = "[tinyplace]";

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
