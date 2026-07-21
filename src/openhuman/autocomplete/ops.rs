//! JSON-RPC / CLI controller surface for in-app inline autocomplete.
//!
//! Only the two RPCs the OpenHuman composer actually calls remain here:
//! `current` (poll for a suggestion against an explicit context) and
//! `accept` (mark a suggestion accepted and persist it for
//! personalisation). The system-wide macOS overlay's status/start/stop/
//! set_style/debug_focus/history-listing surface was removed (issue #5056).

use crate::openhuman::autocomplete::{
    self, AutocompleteAcceptParams, AutocompleteAcceptResult, AutocompleteCurrentParams,
    AutocompleteCurrentResult,
};
use crate::rpc::RpcOutcome;

pub async fn autocomplete_current(
    payload: Option<AutocompleteCurrentParams>,
) -> Result<RpcOutcome<AutocompleteCurrentResult>, String> {
    let override_chars = payload
        .as_ref()
        .and_then(|params| params.context.as_ref())
        .map(|text| text.chars().count())
        .unwrap_or(0);
    let result = autocomplete::global_engine().current(payload).await?;
    let suggestion_chars = result
        .suggestion
        .as_ref()
        .map(|s| s.value.chars().count())
        .unwrap_or(0);
    let current_log = format!(
        "[autocomplete] current app={} context_chars={} override_chars={} suggestion_chars={}",
        result.app_name.as_deref().unwrap_or("n/a"),
        result.context.chars().count(),
        override_chars,
        suggestion_chars
    );
    Ok(RpcOutcome::new(
        result,
        vec!["autocomplete suggestion fetched".to_string(), current_log],
    ))
}

pub async fn autocomplete_accept(
    payload: AutocompleteAcceptParams,
) -> Result<RpcOutcome<AutocompleteAcceptResult>, String> {
    let explicit_chars = payload
        .suggestion
        .as_ref()
        .map(|text| text.chars().count())
        .unwrap_or(0);
    let skip_apply = payload.skip_apply.unwrap_or(false);
    let result = autocomplete::global_engine().accept(payload).await?;
    let accept_log = format!(
        "[autocomplete] accept accepted={} applied={} explicit_chars={} value_chars={} skip_apply={} reason={}",
        if result.accepted { "yes" } else { "no" },
        if result.applied { "yes" } else { "no" },
        explicit_chars,
        result
            .value
            .as_deref()
            .map(|text| text.chars().count())
            .unwrap_or(0),
        if skip_apply { "yes" } else { "no" },
        result.reason.as_deref().unwrap_or("none")
    );
    Ok(RpcOutcome::new(
        result,
        vec!["autocomplete suggestion accepted".to_string(), accept_log],
    ))
}
