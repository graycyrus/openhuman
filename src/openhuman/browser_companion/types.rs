//! Serde-facing types for the Browser Companion domain.
//!
//! These types are the public shape returned to (eventual, later-increment)
//! RPC callers. They deliberately do not leak the vendored
//! `tinyflows::companion` types across the domain boundary — see
//! [`SharedTabView`] vs. `tinyflows::companion::SharedTab`.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// One browser tab the paired extension has explicitly shared with the
/// companion relay. Mapped from `tinyflows::companion::SharedTab`, dropping
/// the `generation` counter (an internal relay-freshness detail, not
/// meaningful to callers of this domain).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SharedTabView {
    pub id: u64,
    pub window_id: u64,
    pub url: String,
    pub title: String,
}

// No `#[cfg(feature = "flows")]` needed here: this whole module is only
// compiled when `browser_companion` itself is compiled, which is already
// gated behind `feature = "flows"` at the `pub mod browser_companion;`
// declaration in `src/openhuman/mod.rs`.
impl From<tinyflows::companion::SharedTab> for SharedTabView {
    fn from(tab: tinyflows::companion::SharedTab) -> Self {
        Self {
            id: tab.id,
            window_id: tab.window_id,
            url: tab.url,
            title: tab.title,
        }
    }
}

/// Current lifecycle + pairing snapshot of the Browser Companion relay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct BrowserCompanionStatus {
    /// Whether the loopback `CompanionServer` is currently running.
    pub running: bool,
    /// Whether a paired extension currently holds an authenticated relay
    /// session. Always `false` when `running` is `false`.
    pub extension_connected: bool,
    /// The extension id the relay is configured to accept, if any.
    pub paired_extension_id: Option<String>,
    /// The `ws://127.0.0.1:<port>/v1/extension` URL the extension connects
    /// to, present only while the relay is running.
    pub relay_url: Option<String>,
    /// Tabs the paired extension has explicitly shared with the companion.
    /// Empty when not running or nothing is shared.
    pub shared_tabs: Vec<SharedTabView>,
}

/// Result of a pair / rotate-secret operation: what the extension needs to
/// complete pairing. Callers must treat `pairing_secret` as sensitive —
/// it authenticates the WebSocket upgrade.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PairingInfo {
    /// The `ws://127.0.0.1:<port>/v1/extension` URL to connect to.
    pub relay_url: String,
    /// The freshly (re)generated pairing secret, exposed exactly once here.
    pub pairing_secret: String,
}
