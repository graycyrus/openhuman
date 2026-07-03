//! The `tinyflows` capability seam: wires the `tinyflows` workflow engine
//! (an external, host-agnostic crate — validate → compile → run on
//! `tinyagents`) to real OpenHuman services.
//!
//! This module is export-focused: business logic for the five capability
//! adapters lives in [`caps`]; run observability logging lives in
//! [`observability`]. [`build_capabilities`] and [`open_flow_checkpointer`]
//! are the two entry points the `flows::` domain (`src/openhuman/flows/ops.rs`)
//! calls to drive a run.

pub mod caps;
pub mod observability;
#[cfg(test)]
mod tests;

use std::sync::Arc;

use anyhow::Context;

use crate::openhuman::config::Config;
use crate::openhuman::security::SecurityPolicy;

/// Builds the [`tinyflows::caps::Capabilities`] bundle for one run, wiring
/// each of the five host-injected traits to a real OpenHuman adapter (see
/// [`caps`] for each adapter's contract).
pub fn build_capabilities(config: Arc<Config>) -> tinyflows::caps::Capabilities {
    let security = Arc::new(SecurityPolicy::from_config(
        &config.autonomy,
        &config.workspace_dir,
        &config.action_dir,
    ));
    let http_config = config.http_request.clone();

    tinyflows::caps::Capabilities {
        llm: Arc::new(caps::OpenHumanLlm {
            config: config.clone(),
        }),
        tools: Arc::new(caps::OpenHumanTools {
            config: config.clone(),
        }),
        http: Arc::new(caps::OpenHumanHttp {
            security,
            http_config,
        }),
        code: Arc::new(caps::OpenHumanCode {
            config: config.clone(),
        }),
        state: Arc::new(caps::FlowStateStore {
            config,
            namespace: "default".to_string(),
        }),
    }
}

/// Opens the durable, cross-process checkpointer a `flows_run` uses via
/// `tinyflows::engine::run_with_checkpointer` — the crate's own
/// `tinyagents::SqliteCheckpointer`, stored under
/// `<workspace_dir>/flows/checkpoints.db`.
///
/// Deliberately **not** a bespoke `SqlRunLedgerCheckpointer`: the crate ships
/// its own SQLite-backed `Checkpointer<State>` impl (feature `sqlite`, already
/// enabled on the `tinyagents` dependency), so the seam just opens it —
/// mirrors the construction in
/// `src/openhuman/agent_orchestration/delegation.rs`.
pub fn open_flow_checkpointer(
    config: &Config,
) -> anyhow::Result<Arc<dyn tinyflows::engine::Checkpointer<serde_json::Value>>> {
    let db_path = config.workspace_dir.join("flows").join("checkpoints.db");
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create flows directory: {}", parent.display()))?;
    }
    tracing::debug!(target: "flows", db = %db_path.display(), "[flows] opening checkpointer");
    Ok(Arc::new(
        tinyagents::graph::SqliteCheckpointer::<serde_json::Value>::open(&db_path)
            .with_context(|| format!("Failed to open flows checkpointer: {}", db_path.display()))?,
    ))
}
