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

// ── Local response wrappers for SDK types that only derive Deserialize ────────
// The SDK marketplace response structs (ProductsResponse, CategoriesResponse,
// FeaturedResponse, ProductReviewsResponse) do not derive Serialize. These local
// wrappers hold the inner vecs (which DO derive Serialize) and can be passed to
// `to_value`.

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
    params: Map<String, Value>,
) -> ControllerFuture {
    Box::pin(async move {
        log::debug!(
            "{LOG_PREFIX} directory_list_agents params_keys={:?}",
            params.keys().collect::<Vec<_>>()
        );
        // Optional nested params object (may be absent or null).
        let query_params: Option<tinyplace::types::AgentQueryParams> = params
            .get("params")
            .and_then(|v| if v.is_null() { None } else { Some(v) })
            .map(|v| {
                serde_json::from_value(v.clone())
                    .map_err(|e| format!("invalid directory list_agents params: {e}"))
            })
            .transpose()?;

        let client = global_state().client().await?;
        let result = client
            .directory
            .list_agents(query_params.as_ref())
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
// Marketplace section — browse, products, categories, featured, artifacts, escrow, jobs reads.

// ── Marketplace: browse_marketplace ──────────────────────────────────────────

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

// ── Marketplace: list_products ────────────────────────────────────────────────

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

// ── Marketplace: get_product ──────────────────────────────────────────────────

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

// ── Marketplace: categories ───────────────────────────────────────────────────

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

// ── Marketplace: featured ─────────────────────────────────────────────────────

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

// ── Marketplace: list_product_reviews ────────────────────────────────────────

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

// ── Artifacts: list ───────────────────────────────────────────────────────────

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

// ── Artifacts: get ────────────────────────────────────────────────────────────

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

// ── Escrow: list ──────────────────────────────────────────────────────────────

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

// ── Escrow: get ───────────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_escrow_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let escrow_id = req_str(&params, "escrowId")?.to_string();
        log::debug!("{LOG_PREFIX} escrow_get escrow_id={escrow_id}");
        let client = global_state().client().await?;
        let result = client.escrow.get(&escrow_id).await.map_err(map_err)?;
        to_value(result)
    })
}

// ── Jobs: list ────────────────────────────────────────────────────────────────

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

// ── Jobs: get ─────────────────────────────────────────────────────────────────

pub(crate) fn handle_tinyplace_jobs_get(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let job_id = req_str(&params, "jobId")?.to_string();
        log::debug!("{LOG_PREFIX} jobs_get job_id={job_id}");
        let client = global_state().client().await?;
        let result = client.jobs.get(&job_id).await.map_err(map_err)?;
        to_value(result)
    })
}
