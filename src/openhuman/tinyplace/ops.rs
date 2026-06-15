//! Business logic helpers for the tiny.place domain.
//!
//! Provides the error-mapping function (`map_err`) used by all handlers and the
//! process-global accessor for [`crate::openhuman::tinyplace::state::TinyPlaceState`].

use std::sync::OnceLock;

use crate::openhuman::tinyplace::state::TinyPlaceState;

const LOG_PREFIX: &str = "[tinyplace]";

// ── Process-global state ─────────────────────────────────────────────────────

static TINYPLACE_STATE: OnceLock<TinyPlaceState> = OnceLock::new();

/// Return the process-global [`TinyPlaceState`], initialising it from the
/// environment on first access.
pub(crate) fn global_state() -> &'static TinyPlaceState {
    TINYPLACE_STATE.get_or_init(TinyPlaceState::from_env)
}

// ── Error mapping ─────────────────────────────────────────────────────────────

/// Map a SDK [`tinyplace::Error`] to a [`String`] the controller layer returns.
///
/// - `402 Payment Required` → `"PAYMENT_REQUIRED:<json>"` prefix (renderer parses
///   this into a typed `PaymentRequiredError`).
/// - Other HTTP errors → logged at `warn` with status code, returned as plain string.
/// - Transport / serialization errors → logged at `error`.
pub(crate) fn map_err(e: tinyplace::Error) -> String {
    if let Some(challenge) = e.payment_required() {
        log::warn!("{LOG_PREFIX} 402 payment_required: {challenge:?}");
        let body = serde_json::to_string(challenge).unwrap_or_default();
        return format!("PAYMENT_REQUIRED:{body}");
    }
    if let Some(status) = e.status() {
        log::warn!("{LOG_PREFIX} http {status}: {e}");
    } else {
        log::error!("{LOG_PREFIX} error: {e}");
    }
    e.to_string()
}
