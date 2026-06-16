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
// Messaging section — public metadata reads only (Signal/E2E methods excluded).

// ── Channels: list ────────────────────────────────────────────────────────────

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

// ── Groups: list ──────────────────────────────────────────────────────────────

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

// ── Broadcasts: list ──────────────────────────────────────────────────────────

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

// ── Inbox: list ───────────────────────────────────────────────────────────────

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

// ── Inbox: counts ─────────────────────────────────────────────────────────────

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

// ── Inbox: write actions (manage your own inbox; owner defaults to agent auth) ──

/// Helper: read the optional `owner` agent-id override from params.
fn opt_owner(params: &Map<String, Value>) -> Option<String> {
    params
        .get("owner")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
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

// ── Channels: membership (join / leave as the authenticated agent) ─────────────

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

// ── Broadcasts: subscribe / unsubscribe ────────────────────────────────────────

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

// ── Groups: join / leave (leave = remove self; SDK has no `leave`) ──────────────

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
