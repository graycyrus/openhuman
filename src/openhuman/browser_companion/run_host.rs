//! [`tinyflows::companion::CompanionRunHost`] implementation that routes
//! Chrome-extension-initiated workflow listing/run/cancel through OpenHuman's
//! own `flows::` domain (Browser Companion Part 2 / E3c) — the run registry,
//! the `require_approval` approval gate, and every other `flows_run` safety
//! check apply to an extension-initiated run exactly as they do to the
//! Workflows UI "Run" button. The extension's visibility floor is the
//! separate E3b `expose_to_browser` per-flow opt-in (see
//! `crate::openhuman::flows::types::Flow::expose_to_browser`): only flows
//! with that flag set are ever listed here, so the extension can neither
//! enumerate nor trigger a flow the user didn't explicitly opt in.
//!
//! Wired into the companion relay's [`tinyflows::companion::CompanionServerConfig::run_host`]
//! seam in `ops::start_with_extension_id` — see `mod.rs`'s module overview.

use tinyflows::companion::{CompanionRunHost, TabId, WorkflowSummary};

use crate::openhuman::browser_companion::LOG_PREFIX;
use crate::openhuman::config::rpc as config_rpc;
use crate::openhuman::flows::ops;
use crate::openhuman::flows::{Flow, FlowRunTrigger};

/// [`CompanionRunHost`] backed by the `flows::` domain.
///
/// Stateless: every method loads a fresh [`crate::openhuman::config::Config`]
/// snapshot via the same timeout-guarded primitive the `flows.*` RPC handlers
/// use (`crate::openhuman::config::rpc::load_config_with_timeout`, aliased
/// `config_rpc` here — see `flows::schemas::handle_run`), so it always
/// reflects the latest persisted flows/settings rather than a stale snapshot
/// captured at construction time.
pub struct BrowserCompanionRunHost;

/// Maps browser-exposed [`Flow`]s onto the wire-facing [`WorkflowSummary`]
/// shape the companion's side panel expects. Factored out as a pure function
/// (no config, no async) so the id/name mapping itself is unit-testable
/// without depending on the process-global config loader `list_workflows`
/// otherwise needs.
fn to_workflow_summaries(flows: Vec<Flow>) -> Vec<WorkflowSummary> {
    flows
        .into_iter()
        .map(|flow| WorkflowSummary {
            id: flow.id,
            name: flow.name,
        })
        .collect()
}

#[async_trait::async_trait]
impl CompanionRunHost for BrowserCompanionRunHost {
    async fn list_workflows(&self) -> Result<Vec<WorkflowSummary>, String> {
        log::debug!("{LOG_PREFIX} run_host: list_workflows: entry");
        let config = config_rpc::load_config_with_timeout().await?;
        let flows = ops::list_browser_exposed_flows(&config)?;
        let summaries = to_workflow_summaries(flows);
        log::debug!(
            "{LOG_PREFIX} run_host: list_workflows: {} exposed workflow(s)",
            summaries.len()
        );
        Ok(summaries)
    }

    async fn start_run(
        &self,
        workflow_id: &str,
        tab_id: TabId,
        input: serde_json::Value,
    ) -> Result<String, String> {
        log::info!("{LOG_PREFIX} run_host: start_run: workflow_id={workflow_id} tab_id={tab_id}");
        let config = config_rpc::load_config_with_timeout().await?;
        // Reuses the exact same pipeline as the Workflows UI "Run" button and
        // the `flows.run` RPC handler — `validate_browser_readiness`, the run
        // registry, and the `require_approval` approval gate all apply
        // unchanged; the only difference is the trigger tag, for auditing (see
        // `FlowRunTrigger::BrowserExtension`). Uses the DETACHED variant so
        // `start_run` returns the run id immediately (the extension awaits this
        // response over the WS control channel) instead of blocking for the
        // flow's full duration; the background run then executes and
        // `cancel_run` can still interrupt it mid-flight.
        let outcome = ops::flows_run_detached_with_browser_tab(
            &config,
            workflow_id,
            input,
            FlowRunTrigger::BrowserExtension,
            Some(tab_id),
        )
        .await?;
        let run_id = outcome
            .value
            .get("run_id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                "flows_run_detached_with_browser_tab result carried no run_id".to_string()
            })?
            .to_string();
        log::info!("{LOG_PREFIX} run_host: start_run: workflow_id={workflow_id} run_id={run_id}");
        Ok(run_id)
    }

    async fn cancel_run(&self, run_id: &str) -> bool {
        log::info!("{LOG_PREFIX} run_host: cancel_run: run_id={run_id}");
        let config = match config_rpc::load_config_with_timeout().await {
            Ok(config) => config,
            Err(error) => {
                log::warn!(
                    "{LOG_PREFIX} run_host: cancel_run: run_id={run_id}: config load failed: {error}"
                );
                return false;
            }
        };
        match ops::flows_cancel_run(&config, run_id).await {
            Ok(outcome) => {
                let cancelled = outcome
                    .value
                    .get("cancelled")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);
                log::info!(
                    "{LOG_PREFIX} run_host: cancel_run: run_id={run_id} cancelled={cancelled}"
                );
                cancelled
            }
            Err(error) => {
                // Not found / already-terminal are expected, non-exceptional
                // outcomes here (the extension may race a run settling on its
                // own) — log at debug, not warn, and report "nothing
                // cancelled" per the trait's contract.
                log::debug!("{LOG_PREFIX} run_host: cancel_run: run_id={run_id}: {error}");
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn test_config(tmp: &TempDir) -> crate::openhuman::config::Config {
        let config = crate::openhuman::config::Config {
            workspace_dir: tmp.path().join("workspace"),
            action_dir: tmp.path().join("workspace"),
            config_path: tmp.path().join("config.toml"),
            ..crate::openhuman::config::Config::default()
        };
        std::fs::create_dir_all(&config.workspace_dir).unwrap();
        config
    }

    fn trigger_only_graph() -> tinyflows::model::WorkflowGraph {
        tinyflows::model::WorkflowGraph {
            nodes: vec![tinyflows::model::Node {
                id: "t".to_string(),
                kind: tinyflows::model::NodeKind::Trigger,
                type_version: 1,
                name: "Trigger".to_string(),
                config: serde_json::Value::Null,
                ports: Vec::new(),
                position: None,
            }],
            ..Default::default()
        }
    }

    /// Proves `BrowserCompanionRunHost` actually satisfies the
    /// `tinyflows::companion::CompanionRunHost` trait object contract the
    /// companion server config (`CompanionServerConfig::run_host: Option<Arc<dyn
    /// CompanionRunHost>>`) requires — the E3c wiring point in `ops.rs`.
    #[test]
    fn browser_companion_run_host_is_a_valid_trait_object() {
        let host: Arc<dyn CompanionRunHost> = Arc::new(BrowserCompanionRunHost);
        // Constructing the trait object is the assertion: this only compiles
        // if `BrowserCompanionRunHost` implements every `CompanionRunHost`
        // method with a matching signature.
        drop(host);
    }

    #[test]
    fn to_workflow_summaries_maps_id_and_name_only() {
        let flows = vec![
            Flow {
                id: "flow_1".to_string(),
                name: "First".to_string(),
                enabled: true,
                graph: trigger_only_graph(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
                last_run_at: None,
                last_status: None,
                require_approval: false,
                expose_to_browser: true,
            },
            Flow {
                id: "flow_2".to_string(),
                name: "Second".to_string(),
                enabled: true,
                graph: trigger_only_graph(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
                last_run_at: None,
                last_status: None,
                require_approval: true,
                expose_to_browser: true,
            },
        ];

        let summaries = to_workflow_summaries(flows);
        assert_eq!(
            summaries,
            vec![
                WorkflowSummary {
                    id: "flow_1".to_string(),
                    name: "First".to_string(),
                },
                WorkflowSummary {
                    id: "flow_2".to_string(),
                    name: "Second".to_string(),
                },
            ]
        );
    }

    /// A minimal manual-trigger graph as raw JSON — `ops::flows_create` takes
    /// the graph pre-validation/migration, matching `flows::ops_tests`'s own
    /// `trigger_only_graph` fixture shape.
    fn trigger_only_graph_json(name: &str) -> serde_json::Value {
        serde_json::json!({
            "name": name,
            "nodes": [ { "id": "t", "kind": "trigger", "name": "Trigger" } ],
            "edges": []
        })
    }

    /// End-to-end (minus the process-global config loader `list_workflows`
    /// wraps around it): a tempdir-backed config with one exposed + one
    /// non-exposed flow feeds `ops::list_browser_exposed_flows` into the same
    /// `to_workflow_summaries` mapping `list_workflows` uses, and only the
    /// exposed flow must appear. `list_workflows` itself isn't called
    /// directly here because it goes through
    /// `config_rpc::load_config_with_timeout`, which resolves the real
    /// process-global `OPENHUMAN_WORKSPACE`/active-user config rather than
    /// taking a config value — exercising that path in a unit test would
    /// race other tests mutating the same env var (see
    /// `config::ops::loader`'s own `#[ignore]`d coverage of that race).
    #[tokio::test]
    async fn list_workflows_mapping_only_includes_exposed_flows() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let exposed = ops::flows_create(
            &config,
            "Exposed".to_string(),
            trigger_only_graph_json("exposed"),
            false,
        )
        .await
        .unwrap()
        .value;
        ops::flows_update(&config, &exposed.id, None, None, None, Some(true), None)
            .await
            .unwrap();

        ops::flows_create(
            &config,
            "Not exposed".to_string(),
            trigger_only_graph_json("not-exposed"),
            false,
        )
        .await
        .unwrap();

        let visible = ops::list_browser_exposed_flows(&config).unwrap();
        let summaries = to_workflow_summaries(visible);
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, exposed.id);
        assert_eq!(summaries[0].name, "Exposed");
    }
}
