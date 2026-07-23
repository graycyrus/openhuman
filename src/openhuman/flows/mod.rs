//! The `flows::` domain: saved automation workflows (tinyflows graphs) —
//! create/get/list/update/delete/enable/run, backed by SQLite. Mirrors
//! `src/openhuman/cron/`'s module shape.
//!
//! Business logic lives in [`ops`]; persistence in `store` (private, with a
//! handful of functions re-exported below for the capability seam's
//! [`crate::openhuman::tinyflows::caps::FlowStateStore`]); the RPC/CLI
//! controller surface in `schemas` (private, re-exported below).

pub mod agents;
pub mod builder_tools;
pub mod bus;
pub mod discovery_tools;
mod draft_store;
pub mod memory_tools;
mod n8n_import;
pub mod node_contracts;
pub mod ops;
mod run_registry;
mod schemas;
mod store;
pub mod tools;
mod types;

pub use schemas::{
    all_controller_schemas as all_flows_controller_schemas,
    all_registered_controllers as all_flows_registered_controllers,
};
// `kv_get`/`kv_set` are re-exported (not just `pub(crate)`-visible within this
// domain's own module tree) because `tinyflows::caps::FlowStateStore`
// (`src/openhuman/tinyflows/caps.rs`) lives in a sibling domain and needs
// them to implement `tinyflows::caps::StateStore` without duplicating the
// `flow_state` table's persistence logic.
// `upsert_flow_run_step` is likewise re-exported for the tinyflows seam: the
// live run observer (`tinyflows::observability::FlowRunObserver`, issue G2)
// lives in the sibling `tinyflows` domain and persists each finished step onto
// the `flow_runs` row through this function as the run executes.
pub use node_contracts::{
    all_node_kind_contracts, node_kind_contract, render_node_kinds_line, ConfigField,
    NodeKindContract, PortSpec, NODE_KINDS,
};
pub use store::{kv_get, kv_set, upsert_flow_run_step};
pub use types::{
    DraftOrigin, Flow, FlowConnection, FlowDraft, FlowImport, FlowRevision, FlowRun, FlowRunStep,
    FlowRunTrigger, FlowSuggestion, FlowValidation, FlowValidationError, SuggestionStatus,
};

/// Prefix for a flow's private, sandboxed memory namespace (see
/// [`flow_namespace`]).
///
/// **Deviates from the originally specced `"flow:"` (colon) separator —
/// deliberately.** The `Memory` trait's `UnifiedMemory` backend
/// (`src/openhuman/memory_store/`) is internally inconsistent about
/// namespace sanitization: `store_with_taint`/`recall`/`list`/
/// `MemoryClient::clear_namespace` all route through
/// `UnifiedMemory::sanitize_namespace`
/// (`memory_store/namespace_store/init.rs`), which collapses any character
/// outside `[A-Za-z0-9_/-]` — including `:` — to `_` before touching SQLite.
/// But `Memory::forget` (`memory_store/memory_trait.rs`) queries
/// `WHERE namespace = ?1` against the **raw, unsanitized** argument. With a
/// `"flow:"` prefix, `forget("flow:<id>", key)` would therefore silently
/// never match the row `store_with_taint` actually persisted as
/// `"flow_<id>"` — the post-run digest subscriber's retention sweep
/// (`bus::FlowRunDigestSubscriber`) would then never evict old entries, and
/// `namespace_summaries()`-based cross-flow listing (`scope: "flows"` in
/// `memory_tools::FlowMemoryRecallTool`) would have to match the sanitized
/// form anyway since `namespace_summaries` reads the persisted (sanitized)
/// column back verbatim. Using `"flow_"` (already a fixed point of
/// `sanitize_namespace`, since flow ids are hyphenated UUIDs — no character
/// in either the prefix or a flow id ever needs sanitizing) makes every
/// `Memory` method agree with every other one on the exact namespace
/// string, with no silent mismatch anywhere. The namespace is still
/// shared-root and profile-independent exactly as specified — only the
/// separator character changed.
pub const FLOW_MEMORY_NAMESPACE_PREFIX: &str = "flow_";

/// Builds a flow's private, profile-independent memory namespace from a
/// `flow_id`.
///
/// **Security invariant:** this is the *only* place in the codebase that may
/// construct this namespace string. Every caller — the `flow_memory_recall`
/// / `flow_memory_remember` agent tools (`memory_tools.rs`), the post-run
/// digest subscriber (`bus::FlowRunDigestSubscriber`), and the
/// `flows_delete` cleanup hook (`ops::flows_delete`) — goes through this
/// function with a `flow_id`, never with a caller-supplied raw namespace.
/// A flow can therefore never write to, or be told the name of, any memory
/// namespace but its own.
pub fn flow_namespace(flow_id: &str) -> String {
    format!("{FLOW_MEMORY_NAMESPACE_PREFIX}{flow_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flow_namespace_uses_the_shared_root_prefix() {
        assert_eq!(flow_namespace("abc-123"), "flow_abc-123");
        assert!(flow_namespace("abc-123").starts_with(FLOW_MEMORY_NAMESPACE_PREFIX));
    }

    #[test]
    fn flow_namespace_is_distinct_per_flow() {
        assert_ne!(flow_namespace("a"), flow_namespace("b"));
    }
}
