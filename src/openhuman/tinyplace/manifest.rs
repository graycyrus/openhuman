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
