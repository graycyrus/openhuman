//! Event bus handlers for the `flows::` domain (issue B2 — see
//! `my_docs/ohxtf/b2-triggers-trust/01-triggers-and-trust.md` §1).
//!
//! [`FlowTriggerSubscriber`] is the trigger → run bridge: it listens for the
//! normalized events a saved flow's trigger node can bind to
//! (`DomainEvent::FlowScheduleTick`, `ComposioTriggerReceived`,
//! `WebhookIncomingRequest`), matches them against enabled flows, and spawns
//! `flows::ops::flows_run` for each match. Matching helpers
//! ([`extract_trigger_kind`], [`extract_trigger_config`]) are also reused by
//! `flows::ops::flows_set_enabled` to bind/unbind a flow's automatic
//! dispatch on enable/disable.

use crate::core::event_bus::{DomainEvent, EventHandler};
use crate::openhuman::config::Config;
use crate::openhuman::flows::store;
use crate::openhuman::flows::{flow_namespace, Flow, FlowRun};
use crate::openhuman::memory::{Memory, MemoryCategory, MemoryTaint};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tinyflows::model::{NodeKind, TriggerKind};
use tinyflows::nodes::control_flow::dedup as dedup_node;

/// Reads `trigger_kind` from a flow's trigger node config, deserializing into
/// `tinyflows::model::TriggerKind`. Returns `None` when the flow doesn't have
/// exactly one trigger node ([`tinyflows::model::WorkflowGraph::trigger`]) or
/// the `trigger_kind` discriminator is missing/invalid — callers treat that
/// as "no automatic binding", not an error (a `manual`-only or legacy graph
/// authored before B2 simply never fires itself).
pub(crate) fn extract_trigger_kind(flow: &Flow) -> Option<TriggerKind> {
    let trigger = flow.graph.trigger()?;
    serde_json::from_value(trigger.config.get("trigger_kind")?.clone()).ok()
}

/// Returns the trigger node's full config value, for callers that need
/// kind-specific fields (`schedule` for `schedule`, `toolkit`/`trigger_slug`
/// for `app_event`, …).
pub(crate) fn extract_trigger_config(flow: &Flow) -> Option<&Value> {
    Some(&flow.graph.trigger()?.config)
}

/// True when `flow` is an enabled `app_event` flow bound to the given
/// Composio `toolkit`/`trigger_slug` (case-insensitive — Composio slugs are
/// conventionally upper-case but authoring surfaces may not normalize them).
fn matches_app_event(flow: &Flow, toolkit: &str, trigger_slug: &str) -> bool {
    if !matches!(extract_trigger_kind(flow), Some(TriggerKind::AppEvent)) {
        return false;
    }
    let Some(cfg) = extract_trigger_config(flow) else {
        return false;
    };
    let cfg_toolkit = cfg.get("toolkit").and_then(Value::as_str).unwrap_or("");
    let cfg_slug = cfg
        .get("trigger_slug")
        .and_then(Value::as_str)
        .unwrap_or("");
    cfg_toolkit.eq_ignore_ascii_case(toolkit) && cfg_slug.eq_ignore_ascii_case(trigger_slug)
}

/// Listens for normalized trigger events and starts runs for matching
/// enabled flows. See the module doc for the full contract.
pub struct FlowTriggerSubscriber {
    config: Arc<Config>,
    /// Process-local dedupe of trigger-driven dispatch, keyed by `flow_id`
    /// (CodeRabbit finding B — overlapping runs for the same flow). A fast
    /// cadence or trigger burst can otherwise fire `spawn_run` for the same
    /// flow multiple times before the first run finishes, racing
    /// `last_run_at`/`last_status` and doing duplicate work. This is
    /// intentionally scoped to trigger-driven dispatch (this subscriber) —
    /// the interactive `flows_run` RPC is NOT deduped, since a user
    /// explicitly asking to run a flow again (e.g. while a scheduled run is
    /// still in flight) is fine.
    in_flight: Arc<Mutex<HashSet<String>>>,
}

impl FlowTriggerSubscriber {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            config,
            in_flight: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Attempts to claim `flow_id` for a trigger-driven dispatch. Returns
    /// `None` when a dispatch for the same flow is already in flight — the
    /// caller should skip this tick. Returns `Some(guard)` on success; the
    /// guard releases the claim on `Drop` (including on panic/early return),
    /// so a run can never permanently wedge the flow out of future ticks.
    fn try_acquire_dispatch(&self, flow_id: &str) -> Option<InFlightGuard> {
        let mut in_flight = self.in_flight.lock().unwrap_or_else(|e| e.into_inner());
        if !in_flight.insert(flow_id.to_string()) {
            return None;
        }
        Some(InFlightGuard {
            set: self.in_flight.clone(),
            flow_id: flow_id.to_string(),
        })
    }

    /// `DomainEvent::FlowScheduleTick` — a `flow`-type cron job fired. Loads
    /// the one named flow, checks it is still enabled with a `schedule`
    /// trigger (it may have been disabled/edited since the job was
    /// registered), and dispatches it with an empty trigger payload.
    async fn handle_schedule_tick(&self, flow_id: &str) {
        let flow = match store::get_flow(&self.config, flow_id) {
            Ok(Some(flow)) => flow,
            Ok(None) => {
                tracing::debug!(target: "flows", %flow_id, "[flows] schedule tick for unknown/removed flow — ignoring");
                return;
            }
            Err(e) => {
                tracing::warn!(target: "flows", %flow_id, error = %e, "[flows] failed to load flow for schedule tick");
                return;
            }
        };
        if !flow.enabled {
            tracing::debug!(target: "flows", %flow_id, "[flows] schedule tick for disabled flow — ignoring");
            return;
        }
        if !matches!(extract_trigger_kind(&flow), Some(TriggerKind::Schedule)) {
            tracing::debug!(target: "flows", %flow_id, "[flows] schedule tick for flow whose trigger is no longer `schedule` — ignoring");
            return;
        }
        self.spawn_run(
            flow_id.to_string(),
            Value::Null,
            crate::openhuman::flows::FlowRunTrigger::Schedule,
        );
    }

    /// `DomainEvent::ComposioTriggerReceived` — scans every enabled flow for
    /// an `app_event` trigger bound to this `toolkit`/`trigger_slug` and
    /// dispatches each match with the event payload as the run input
    /// (seeded into `run.trigger`, per the node-catalog contract).
    async fn handle_app_event(&self, toolkit: &str, trigger_slug: &str, payload: &Value) {
        let flows = match store::list_enabled_flows(&self.config) {
            Ok(flows) => flows,
            Err(e) => {
                tracing::warn!(target: "flows", %toolkit, %trigger_slug, error = %e, "[flows] failed to list enabled flows for app_event dispatch");
                return;
            }
        };

        let mut matched = 0usize;
        for flow in flows {
            if matches_app_event(&flow, toolkit, trigger_slug) {
                matched += 1;
                self.spawn_run(
                    flow.id.clone(),
                    payload.clone(),
                    crate::openhuman::flows::FlowRunTrigger::AppEvent,
                );
            }
        }
        tracing::debug!(target: "flows", %toolkit, %trigger_slug, matched, "[flows] app_event trigger matching complete");
    }

    /// Spawns a background `flows::ops::flows_run` for `flow_id`. Fire-and-
    /// forget from the bus's perspective — `flows_run` itself records the
    /// outcome onto the flow's summary fields and a `flow_runs` history row,
    /// and surfaces a `CoreNotification` when the run pauses for approval.
    ///
    /// Skips the dispatch (see [`try_acquire_dispatch`]) if a trigger-driven
    /// run for this `flow_id` is already in flight, so a fast schedule or a
    /// burst of matching `app_event`s cannot run the same flow concurrently.
    fn spawn_run(
        &self,
        flow_id: String,
        input: Value,
        trigger: crate::openhuman::flows::FlowRunTrigger,
    ) {
        let Some(guard) = self.try_acquire_dispatch(&flow_id) else {
            tracing::debug!(target: "flows", %flow_id, "[flows] trigger: flow already running — skipping this tick");
            return;
        };

        let config = self.config.clone();
        tokio::spawn(async move {
            // Held for the lifetime of the run; released on drop (including
            // on panic) by `InFlightGuard`.
            let _guard = guard;
            tracing::info!(target: "flows", %flow_id, "[flows] trigger fired — starting run");
            match crate::openhuman::flows::ops::flows_run(&config, &flow_id, input, trigger).await {
                Ok(_) => {
                    tracing::info!(target: "flows", %flow_id, "[flows] trigger-driven run finished")
                }
                Err(e) => {
                    tracing::warn!(target: "flows", %flow_id, error = %e, "[flows] trigger-driven run failed")
                }
            }
        });
    }
}

/// Drop guard releasing a [`FlowTriggerSubscriber::try_acquire_dispatch`]
/// claim. Removing the `flow_id` on `Drop` (rather than only on the happy
/// path) means a panicking or erroring `flows_run` still frees the flow up
/// for its next trigger tick.
struct InFlightGuard {
    set: Arc<Mutex<HashSet<String>>>,
    flow_id: String,
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        // Recover from a poisoned lock (mirrors `try_acquire_dispatch`) so the
        // flow_id is always removed — otherwise a poison would wedge this flow
        // out of every future trigger dispatch, defeating the guard's purpose.
        let mut set = self.set.lock().unwrap_or_else(|e| e.into_inner());
        set.remove(&self.flow_id);
    }
}

#[async_trait]
impl EventHandler for FlowTriggerSubscriber {
    fn name(&self) -> &str {
        "flows::trigger"
    }

    fn domains(&self) -> Option<&[&str]> {
        Some(&["cron", "composio", "webhook", "system"])
    }

    async fn handle(&self, event: &DomainEvent) {
        match event {
            DomainEvent::FlowScheduleTick { flow_id } => self.handle_schedule_tick(flow_id).await,
            DomainEvent::ComposioTriggerReceived {
                toolkit,
                trigger,
                payload,
                ..
            } => self.handle_app_event(toolkit, trigger, payload).await,
            DomainEvent::WebhookIncomingRequest { .. } => {
                // Best-effort deviation (documented, not silently skipped —
                // see `flows::ops::log_webhook_trigger_deferred` for the
                // enable/disable-side note): a `webhook`-trigger flow needs a
                // backend-provisioned tunnel + a UI surface for the resulting
                // URL, neither of which exists yet. Never log the request's
                // `raw_data` here — it is untrusted, possibly-sensitive
                // inbound payload.
                tracing::debug!(
                    target: "flows",
                    "[flows] observed WebhookIncomingRequest — webhook-trigger dispatch is not \
                     implemented in B2 (pending backend tunnel provisioning + B3 UI); no flow \
                     dispatched"
                );
            }
            other => {
                // Anything else on our filtered domains (plain shell/agent
                // `CronJobTriggered`, other Composio lifecycle events,
                // system lifecycle, …) is not a flow trigger — ignore. Log
                // only the variant name, never the event's Debug form: some
                // sibling variants on these domains carry payloads we must
                // not put in logs (e.g. `ComposioTriggerReceived::payload`).
                tracing::trace!(target: "flows", variant = other.variant_name(), "[flows] ignoring unrelated event");
            }
        }
    }
}

/// Bounds a post-run memory digest to a compact, LLM-cheap size — a single
/// run's summary must never dominate a later `flow_memory_recall`.
const DIGEST_MAX_CHARS: usize = 1000;

/// Cap on how many `run_digest:*` entries [`FlowRunDigestSubscriber`] keeps
/// per flow's memory namespace before pruning the oldest.
const DIGEST_RETENTION_CAP: usize = 50;

/// Listens for `DomainEvent::FlowRunFinished` and, on a successful terminal
/// status, writes a compact digest of the run into the flow's own private
/// memory namespace ([`flow_namespace`]) — e.g. so a later run of the same
/// scheduled digest flow can `flow_memory_recall` what it already sent
/// without re-deriving that from the target service.
///
/// Success-only: `"failed"` / `"cancelled"` / `"interrupted"` / any other
/// terminal status is ignored, since a digest of a run that didn't actually
/// complete its work would misleadingly look like a record of real output.
///
/// Best-effort throughout: every failure here is logged via `tracing::warn!`
/// and swallowed, never propagated — by the time this subscriber observes
/// `FlowRunFinished`, the run has already settled its own `flow_runs` row, so
/// a memory-layer hiccup must never retroactively affect run status.
pub struct FlowRunDigestSubscriber {
    config: Arc<Config>,
    /// Test-only memory override. In production this is `None` and the digest
    /// resolves the process-global memory client via [`active_memory_client`].
    /// The process-global client is a one-shot `OnceLock`, so a unit test
    /// cannot reliably rebind it to its own tempdir (an earlier test in the
    /// same binary may already have initialised the singleton — see
    /// `memory::global`'s own test notes). Injecting a directly-constructed
    /// [`Memory`] here lets the digest tests write and read back through the
    /// SAME instance deterministically, exactly as `flows::memory_tools`'
    /// tests do with `UnifiedMemory::new`.
    memory_override: Option<Arc<dyn Memory>>,
}

impl FlowRunDigestSubscriber {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            config,
            memory_override: None,
        }
    }

    /// Test constructor: run the digest against an explicitly-provided memory
    /// instance instead of the process-global client. See [`Self::memory_override`].
    #[cfg(test)]
    fn with_memory(config: Arc<Config>, memory: Arc<dyn Memory>) -> Self {
        Self {
            config,
            memory_override: Some(memory),
        }
    }

    /// Resolves the memory handle the digest writes to: the injected test
    /// override when present, else the process-global client
    /// ([`active_memory_client`]). Returns `None` (best-effort skip) when the
    /// global client is unavailable.
    async fn resolve_memory(&self) -> Option<Arc<dyn Memory>> {
        if let Some(memory) = &self.memory_override {
            return Some(memory.clone());
        }
        match crate::openhuman::memory::ops::helpers::active_memory_client().await {
            Ok(client) => Some(client.memory_handle()),
            Err(e) => {
                tracing::warn!(target: "flows", error = %e, "[flows] digest: memory client unavailable — skipping");
                None
            }
        }
    }

    async fn handle_finished(&self, flow_id: &str, run_id: &str, status: &str) {
        if status != "completed" && status != "completed_with_warnings" {
            tracing::trace!(target: "flows", %flow_id, %run_id, %status, "[flows] digest: ignoring non-success terminal status");
            return;
        }

        let flow_name = match store::get_flow(&self.config, flow_id) {
            Ok(Some(flow)) => flow.name,
            Ok(None) => {
                tracing::debug!(target: "flows", %flow_id, %run_id, "[flows] digest: flow no longer exists — skipping");
                return;
            }
            Err(e) => {
                tracing::warn!(target: "flows", %flow_id, %run_id, error = %e, "[flows] digest: failed to load flow — skipping");
                return;
            }
        };

        let run = match store::get_flow_run(&self.config, run_id) {
            Ok(Some(run)) => run,
            Ok(None) => {
                tracing::warn!(target: "flows", %flow_id, %run_id, "[flows] digest: run row not found — skipping");
                return;
            }
            Err(e) => {
                tracing::warn!(target: "flows", %flow_id, %run_id, error = %e, "[flows] digest: failed to load run — skipping");
                return;
            }
        };

        let digest = render_run_digest(&flow_name, &run);

        let Some(memory) = self.resolve_memory().await else {
            return;
        };
        let namespace = flow_namespace(flow_id);
        let digest_key = format!("run_digest:{run_id}");

        if let Err(e) = memory
            .store_with_taint(
                &namespace,
                &digest_key,
                &digest,
                MemoryCategory::Core,
                None,
                MemoryTaint::ExternalSync,
            )
            .await
        {
            tracing::warn!(target: "flows", %flow_id, %run_id, %namespace, error = %e, "[flows] digest: failed to write run digest");
            return;
        }

        self.enforce_retention_cap(&memory, &namespace).await;
    }

    /// Best-effort prune: keeps at most [`DIGEST_RETENTION_CAP`] `run_digest:*`
    /// entries per flow namespace, evicting the oldest (by `timestamp`) first.
    async fn enforce_retention_cap(&self, memory: &Arc<dyn Memory>, namespace: &str) {
        let entries = match memory.list(Some(namespace), None, None).await {
            Ok(entries) => entries,
            Err(e) => {
                tracing::warn!(target: "flows", %namespace, error = %e, "[flows] digest: retention sweep failed to list namespace");
                return;
            }
        };
        let mut digests: Vec<_> = entries
            .into_iter()
            .filter(|entry| entry.key.starts_with("run_digest:"))
            .collect();
        if digests.len() <= DIGEST_RETENTION_CAP {
            return;
        }
        // Oldest first, so the excess taken below is the stalest entries.
        digests.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        let excess = digests.len() - DIGEST_RETENTION_CAP;
        for entry in digests.into_iter().take(excess) {
            if let Err(e) = memory.forget(namespace, &entry.key).await {
                tracing::warn!(target: "flows", %namespace, key = %entry.key, error = %e, "[flows] digest: retention sweep failed to forget stale entry");
            }
        }
    }
}

#[async_trait]
impl EventHandler for FlowRunDigestSubscriber {
    fn name(&self) -> &str {
        "flows::digest"
    }

    fn domains(&self) -> Option<&[&str]> {
        // `FlowRunFinished` — the only event this subscriber handles — is
        // itself tagged `"cron"` by `DomainEvent::domain()` (grouped there
        // with the other flow-run/schedule events), not `"flows"`. This is
        // matching that tag, not a typo.
        Some(&["cron"])
    }

    async fn handle(&self, event: &DomainEvent) {
        if let DomainEvent::FlowRunFinished {
            flow_id,
            run_id,
            status,
        } = event
        {
            self.handle_finished(flow_id, run_id, status).await;
        }
    }
}

/// Truncates `s` to at most `max` `char`s, appending `…` when truncated.
fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let truncated: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{truncated}…")
}

/// Composes a compact, bounded summary of a finished run: flow name,
/// finished-at, status, node count, and per-node status + truncated output.
/// Bounded to [`DIGEST_MAX_CHARS`] total.
fn render_run_digest(flow_name: &str, run: &FlowRun) -> String {
    use std::fmt::Write;
    let mut out = String::new();
    let _ = writeln!(out, "Flow: {flow_name}");
    let _ = writeln!(out, "Status: {}", run.status);
    if let Some(finished_at) = &run.finished_at {
        let _ = writeln!(out, "Finished: {finished_at}");
    }
    let _ = writeln!(out, "Nodes: {}", run.steps.len());
    for step in &run.steps {
        if out.chars().count() >= DIGEST_MAX_CHARS {
            break;
        }
        let status = step.status.as_deref().unwrap_or("?");
        let output = truncate_chars(&step.output.to_string(), 120);
        let _ = writeln!(out, "- {} [{status}]: {output}", step.node_id);
    }
    truncate_chars(&out, DIGEST_MAX_CHARS)
}

/// Listens for `DomainEvent::FlowRunFinished` and settles every `dedup` node
/// in the finished flow's graph — the host half of the commit-on-success
/// exactly-once contract the tinyflows `dedup` node depends on (issue #5263
/// PR2; the filter half — `DedupNode` — is PR1, already in `vendor/tinyflows`;
/// see `tinyflows::nodes::control_flow::dedup`'s module docs for the full
/// two-sided contract this subscriber implements).
///
/// For every `dedup` node found in the flow's saved graph:
/// - **Success** (`"completed"` / `"completed_with_warnings"`): unions the
///   node's `tentative` key set into its `committed` set, then clears
///   `tentative`. `completed_with_warnings` counts as success — the run
///   reached a terminal, non-retried outcome, so the items it processed are
///   genuinely done even if some non-fatal step warned.
/// - **Anything else** (`"failed"` / `"cancelled"` / `"interrupted"`, or any
///   future/unrecognized status string): clears `tentative` only, leaving
///   `committed` untouched, so the released keys are exactly as unseen as
///   before this run and the flow's next run reprocesses them. An
///   unrecognized status is deliberately treated as failure, not success —
///   "retry an already-done item" is always safe, "silently mark an
///   uncertain outcome as done" is not.
///
/// `StateStore` exposes no prefix-scan, so the only way to know which
/// `dedup:<node_id>:*` keys exist for a flow is to derive `<node_id>` from
/// the flow's own saved graph — this subscriber loads `flow_id`'s graph on
/// every event rather than trying to infer node ids from the event itself.
///
/// Reuses the exact same per-flow `StateStore` namespace
/// (`"flow:<flow_id>"`, see `tinyflows::caps::build_capabilities` in
/// `src/openhuman/tinyflows/caps.rs`) the engine's `FlowStateStore` hands the
/// `dedup` node during the run — that collision with the node's own keys is
/// the entire point.
///
/// Best-effort throughout: every failure here is logged via `tracing::warn!`
/// and swallowed, never propagated — by the time this subscriber observes
/// `FlowRunFinished`, the run has already settled its own `flow_runs` row, so
/// a state-store hiccup here must never retroactively affect run status. A
/// failed commit degrades to "retry next run" (an item is reprocessed, never
/// lost); a failed release degrades to "stays tentative", which the `dedup`
/// node treats as unseen anyway since it only ever consults `committed` —
/// neither failure mode risks silently dropping an item.
pub struct DedupCommitSubscriber {
    config: Arc<Config>,
}

impl DedupCommitSubscriber {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }

    /// The node ids of every `dedup` node in `flow_id`'s saved graph, or an
    /// empty vec (logged, not propagated) if the flow can't be loaded — a
    /// flow deleted between run-finish and this handler firing, or a
    /// transient store error, both degrade to "nothing to settle" rather than
    /// panicking the event bus.
    fn dedup_node_ids(&self, flow_id: &str) -> Vec<String> {
        match store::get_flow(&self.config, flow_id) {
            Ok(Some(flow)) => flow
                .graph
                .nodes
                .iter()
                .filter(|n| n.kind == NodeKind::Dedup)
                .map(|n| n.id.clone())
                .collect(),
            Ok(None) => {
                tracing::debug!(target: "flows", %flow_id, "[dedup-commit] flow no longer exists — skipping");
                Vec::new()
            }
            Err(e) => {
                tracing::warn!(target: "flows", %flow_id, error = %e, "[dedup-commit] failed to load flow graph — skipping");
                Vec::new()
            }
        }
    }

    async fn handle_finished(&self, flow_id: &str, run_id: &str, status: &str) {
        let node_ids = self.dedup_node_ids(flow_id);
        if node_ids.is_empty() {
            tracing::trace!(target: "flows", %flow_id, %run_id, %status, "[dedup-commit] no dedup nodes in this flow — nothing to settle");
            return;
        }

        let success = matches!(status, "completed" | "completed_with_warnings");
        tracing::debug!(
            target: "flows", %flow_id, %run_id, %status, success,
            dedup_node_count = node_ids.len(),
            "[dedup-commit] settling dedup nodes for finished run"
        );

        let namespace = format!("flow:{flow_id}");
        for node_id in node_ids {
            if success {
                self.commit(&namespace, &node_id, flow_id, run_id);
            } else {
                self.release(&namespace, &node_id, flow_id, run_id);
            }
        }
    }

    /// Success path: union this node's `tentative` set into `committed`, then
    /// clear `tentative`.
    fn commit(&self, namespace: &str, node_id: &str, flow_id: &str, run_id: &str) {
        let tentative_key = dedup_node::tentative_key(node_id);
        let committed_key = dedup_node::committed_key(node_id);

        let tentative = load_key_set(&self.config, namespace, &tentative_key);
        if tentative.is_empty() {
            tracing::trace!(target: "flows", %flow_id, %run_id, node_id, "[dedup-commit] no tentative keys — nothing to commit");
            return;
        }

        let mut committed = load_key_set(&self.config, namespace, &committed_key);
        let added = tentative
            .iter()
            .filter(|k| committed.insert((*k).clone()))
            .count();

        if let Err(e) = store_key_set(&self.config, namespace, &committed_key, &committed) {
            tracing::warn!(
                target: "flows", %flow_id, %run_id, node_id, error = %e,
                "[dedup-commit] failed to write committed set — tentative left in place, will \
                 retry the commit on this node's next successful run"
            );
            return;
        }
        tracing::debug!(
            target: "flows", %flow_id, %run_id, node_id, added, committed_len = committed.len(),
            "[dedup-commit] committed tentative keys"
        );

        if let Err(e) = store::kv_delete(&self.config, namespace, &tentative_key) {
            tracing::warn!(
                target: "flows", %flow_id, %run_id, node_id, error = %e,
                "[dedup-commit] committed but failed to clear tentative — harmless: the next \
                 run's dedup load will re-union the same, now-already-committed keys (committed \
                 is a set, so re-adding them is a no-op)"
            );
        }
    }

    /// Failure path: clear `tentative` only, leaving `committed` untouched so
    /// the released keys retry on the flow's next run.
    fn release(&self, namespace: &str, node_id: &str, flow_id: &str, run_id: &str) {
        let released =
            load_key_set(&self.config, namespace, &dedup_node::tentative_key(node_id)).len();
        if released == 0 {
            tracing::trace!(target: "flows", %flow_id, %run_id, node_id, "[dedup-commit] no tentative keys — nothing to release");
            return;
        }
        match store::kv_delete(&self.config, namespace, &dedup_node::tentative_key(node_id)) {
            Ok(()) => tracing::debug!(
                target: "flows", %flow_id, %run_id, node_id, released,
                "[dedup-commit] released tentative keys — will retry next run"
            ),
            Err(e) => tracing::warn!(
                target: "flows", %flow_id, %run_id, node_id, error = %e,
                "[dedup-commit] failed to release tentative — those keys remain tentative until \
                 a future successful commit reconciles them (harmless: committed stays untouched \
                 either way, so no item is ever wrongly marked done)"
            ),
        }
    }
}

#[async_trait]
impl EventHandler for DedupCommitSubscriber {
    fn name(&self) -> &str {
        "flows::dedup_commit"
    }

    fn domains(&self) -> Option<&[&str]> {
        // Same reasoning as `FlowRunDigestSubscriber::domains` just above:
        // `FlowRunFinished` is tagged `"cron"` by `DomainEvent::domain()`.
        Some(&["cron"])
    }

    async fn handle(&self, event: &DomainEvent) {
        if let DomainEvent::FlowRunFinished {
            flow_id,
            run_id,
            status,
        } = event
        {
            self.handle_finished(flow_id, run_id, status).await;
        }
    }
}

/// Loads a `dedup` node's key set (stored as a JSON array of strings) from
/// the flow-state KV table. Mirrors
/// `tinyflows::nodes::control_flow::dedup`'s own key-set loader: a missing
/// key, a non-array value, or an array with non-string elements all degrade
/// to an empty set rather than an error — a first run against a fresh store
/// has nothing recorded yet, which is not a fault.
fn load_key_set(config: &Config, namespace: &str, key: &str) -> HashSet<String> {
    match store::kv_get(config, namespace, key) {
        Ok(Some(value)) => value
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        Ok(None) => HashSet::new(),
        Err(e) => {
            tracing::warn!(target: "flows", %namespace, key, error = %e, "[dedup-commit] failed to load key set — treating as empty");
            HashSet::new()
        }
    }
}

/// Persists `set` under `key` as a JSON array of strings, sorted for a
/// stable, diffable on-disk representation (membership is exact-match either
/// way, so sort order carries no semantic meaning).
fn store_key_set(
    config: &Config,
    namespace: &str,
    key: &str,
    set: &HashSet<String>,
) -> anyhow::Result<()> {
    let mut keys: Vec<String> = set.iter().cloned().collect();
    keys.sort_unstable();
    let value = Value::Array(keys.into_iter().map(Value::String).collect());
    store::kv_set(config, namespace, key, &value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openhuman::embeddings::NoopEmbedding;
    use crate::openhuman::flows::Flow;
    use crate::openhuman::memory_store::UnifiedMemory;
    use serde_json::json;
    use tinyflows::model::{Node, NodeKind, WorkflowGraph};

    /// A directly-constructed, isolated [`Memory`] for the digest tests — NOT
    /// the process-global `OnceLock` client. The global is one-shot, so an
    /// earlier test in the same binary may already have bound it to a different
    /// workspace, making `global::init(..)` here a silent no-op (see
    /// `memory::global`'s own test notes). Injecting this instance into the
    /// subscriber via [`FlowRunDigestSubscriber::with_memory`] makes writes and
    /// read-backs go through the SAME store deterministically — the same shape
    /// `flows::memory_tools`' tests use.
    fn digest_test_memory(tmp: &tempfile::TempDir) -> Arc<dyn Memory> {
        Arc::new(UnifiedMemory::new(tmp.path(), Arc::new(NoopEmbedding), None).unwrap())
    }

    fn test_config(tmp: &tempfile::TempDir) -> Arc<Config> {
        let config = Config {
            workspace_dir: tmp.path().join("workspace"),
            action_dir: tmp.path().join("workspace"),
            config_path: tmp.path().join("config.toml"),
            ..Config::default()
        };
        std::fs::create_dir_all(&config.workspace_dir).unwrap();
        Arc::new(config)
    }

    fn trigger_node(config: Value) -> Node {
        Node {
            id: "t".to_string(),
            kind: NodeKind::Trigger,
            type_version: 1,
            name: "Trigger".to_string(),
            config,
            ports: Vec::new(),
            position: None,
        }
    }

    fn flow_with_trigger_config(id: &str, enabled: bool, trigger_config: Value) -> Flow {
        Flow {
            id: id.to_string(),
            name: id.to_string(),
            enabled,
            graph: WorkflowGraph {
                nodes: vec![trigger_node(trigger_config)],
                ..Default::default()
            },
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            last_run_at: None,
            last_status: None,
            require_approval: false,
        }
    }

    fn dedup_node(id: &str) -> Node {
        Node {
            id: id.to_string(),
            kind: NodeKind::Dedup,
            type_version: 1,
            name: id.to_string(),
            config: json!({ "key": "=item.id" }),
            ports: Vec::new(),
            position: None,
        }
    }

    /// A saved flow with a `trigger` node plus one `dedup` node with id
    /// `dedup_id` — the minimal graph [`DedupCommitSubscriber::dedup_node_ids`]
    /// needs to find something to settle.
    fn flow_with_dedup_node(id: &str, dedup_id: &str) -> Flow {
        Flow {
            id: id.to_string(),
            name: id.to_string(),
            enabled: true,
            graph: WorkflowGraph {
                nodes: vec![trigger_node(json!({})), dedup_node(dedup_id)],
                ..Default::default()
            },
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            last_run_at: None,
            last_status: None,
            require_approval: false,
        }
    }

    #[test]
    fn name_and_domains_are_stable() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = FlowTriggerSubscriber::new(test_config(&tmp));
        assert_eq!(sub.name(), "flows::trigger");
        assert_eq!(
            sub.domains(),
            Some(&["cron", "composio", "webhook", "system"][..])
        );
    }

    #[tokio::test]
    async fn handle_does_not_panic_on_arbitrary_events() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = FlowTriggerSubscriber::new(test_config(&tmp));
        sub.handle(&DomainEvent::CronJobTriggered {
            job_id: "j1".into(),
            job_name: "test".into(),
            job_type: "shell".into(),
        })
        .await;
        sub.handle(&DomainEvent::FlowScheduleTick {
            flow_id: "missing-flow".into(),
        })
        .await;
    }

    #[test]
    fn extract_trigger_kind_reads_schedule() {
        let flow = flow_with_trigger_config(
            "f1",
            true,
            json!({ "trigger_kind": "schedule", "schedule": "0 9 * * *" }),
        );
        assert!(matches!(
            extract_trigger_kind(&flow),
            Some(TriggerKind::Schedule)
        ));
    }

    #[test]
    fn extract_trigger_kind_none_for_missing_discriminator() {
        let flow = flow_with_trigger_config("f1", true, json!({}));
        assert!(extract_trigger_kind(&flow).is_none());
    }

    #[test]
    fn extract_trigger_kind_none_for_invalid_discriminator() {
        let flow = flow_with_trigger_config("f1", true, json!({ "trigger_kind": "not_a_kind" }));
        assert!(extract_trigger_kind(&flow).is_none());
    }

    #[test]
    fn matches_app_event_requires_toolkit_and_slug_match() {
        let flow = flow_with_trigger_config(
            "f1",
            true,
            json!({ "trigger_kind": "app_event", "toolkit": "gmail", "trigger_slug": "GMAIL_NEW_GMAIL_MESSAGE" }),
        );
        assert!(matches_app_event(&flow, "gmail", "GMAIL_NEW_GMAIL_MESSAGE"));
        // Case-insensitive.
        assert!(matches_app_event(&flow, "Gmail", "gmail_new_gmail_message"));
        // Wrong toolkit or slug does not match.
        assert!(!matches_app_event(
            &flow,
            "slack",
            "GMAIL_NEW_GMAIL_MESSAGE"
        ));
        assert!(!matches_app_event(&flow, "gmail", "SLACK_NEW_MESSAGE"));
    }

    #[test]
    fn matches_app_event_false_for_non_app_event_trigger() {
        let flow = flow_with_trigger_config(
            "f1",
            true,
            json!({ "trigger_kind": "schedule", "schedule": "0 9 * * *" }),
        );
        assert!(!matches_app_event(
            &flow,
            "gmail",
            "GMAIL_NEW_GMAIL_MESSAGE"
        ));
    }

    #[tokio::test]
    async fn handle_app_event_ignores_disabled_flows() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = flow_with_trigger_config(
            "disabled-flow",
            false,
            json!({ "trigger_kind": "app_event", "toolkit": "gmail", "trigger_slug": "GMAIL_NEW_GMAIL_MESSAGE" }),
        );
        crate::openhuman::flows::store::upsert_flow(&config, &flow).unwrap();

        // `list_enabled_flows` must not surface the disabled flow at all —
        // proves the subscriber's dispatch source already excludes it,
        // rather than asserting on a spawned background task's side effect.
        let enabled = crate::openhuman::flows::store::list_enabled_flows(&config).unwrap();
        assert!(enabled.is_empty());
    }

    #[tokio::test]
    async fn handle_schedule_tick_ignores_disabled_flow() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = flow_with_trigger_config(
            "sched-flow",
            false,
            json!({ "trigger_kind": "schedule", "schedule": "0 9 * * *" }),
        );
        crate::openhuman::flows::store::upsert_flow(&config, &flow).unwrap();

        let sub = FlowTriggerSubscriber::new(config.clone());
        // Must not panic and must not spawn a run for a disabled flow — we
        // can't directly observe "no run happened" without a full flows_run
        // fixture, but this exercises the early-return path without error.
        sub.handle(&DomainEvent::FlowScheduleTick {
            flow_id: "sched-flow".into(),
        })
        .await;
    }

    // ── in-flight dedupe (CodeRabbit finding B) ─────────────────────

    #[test]
    fn try_acquire_dispatch_skips_a_flow_already_in_flight() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = FlowTriggerSubscriber::new(test_config(&tmp));

        let guard = sub
            .try_acquire_dispatch("f1")
            .expect("first claim for f1 should succeed");
        assert!(
            sub.try_acquire_dispatch("f1").is_none(),
            "a second claim for the same flow while the first is held must be skipped"
        );

        // A different flow is unaffected.
        assert!(sub.try_acquire_dispatch("f2").is_some());

        drop(guard);
        assert!(
            sub.try_acquire_dispatch("f1").is_some(),
            "dropping the guard must release the claim so f1 can run again"
        );
    }

    #[test]
    fn default_constructs_the_same_as_new() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let a = FlowTriggerSubscriber::new(config.clone());
        let b = FlowTriggerSubscriber::new(config);
        assert_eq!(a.name(), b.name());
    }

    // ── FlowRunDigestSubscriber ─────────────────────────────────────

    #[test]
    fn digest_name_and_domains_are_stable() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = FlowRunDigestSubscriber::new(test_config(&tmp));
        assert_eq!(sub.name(), "flows::digest");
        assert_eq!(sub.domains(), Some(&["cron"][..]));
    }

    #[tokio::test]
    async fn digest_handle_does_not_panic_on_unrelated_events() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = FlowRunDigestSubscriber::new(test_config(&tmp));
        // Must not panic, and must not touch the memory layer at all, for
        // any event other than `FlowRunFinished`.
        sub.handle(&DomainEvent::CronJobTriggered {
            job_id: "j1".into(),
            job_name: "test".into(),
            job_type: "shell".into(),
        })
        .await;
    }

    #[tokio::test]
    async fn digest_ignores_failed_run() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let memory = digest_test_memory(&tmp);

        let flow = flow_with_trigger_config("f-failed", true, json!({}));
        store::upsert_flow(&config, &flow).unwrap();
        store::insert_flow_run(
            &config,
            "run-failed",
            "f-failed",
            "thread-failed",
            "2026-01-01T00:00:00Z",
        )
        .unwrap();
        store::finish_flow_run(
            &config,
            "run-failed",
            "failed",
            "2026-01-01T00:05:00Z",
            &[],
            &[],
            Some("boom"),
        )
        .unwrap();

        let sub = FlowRunDigestSubscriber::with_memory(config, memory.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-failed".into(),
            run_id: "run-failed".into(),
            status: "failed".into(),
        })
        .await;

        let entry = memory
            .get(&flow_namespace("f-failed"), "run_digest:run-failed")
            .await
            .unwrap();
        assert!(
            entry.is_none(),
            "a failed run must never produce a run_digest entry"
        );
    }

    #[tokio::test]
    async fn digest_ignores_cancelled_run() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let memory = digest_test_memory(&tmp);

        let flow = flow_with_trigger_config("f-cancelled", true, json!({}));
        store::upsert_flow(&config, &flow).unwrap();
        store::insert_flow_run(
            &config,
            "run-cancelled",
            "f-cancelled",
            "thread-cancelled",
            "2026-01-01T00:00:00Z",
        )
        .unwrap();
        store::finish_flow_run(
            &config,
            "run-cancelled",
            "cancelled",
            "2026-01-01T00:05:00Z",
            &[],
            &[],
            None,
        )
        .unwrap();

        let sub = FlowRunDigestSubscriber::with_memory(config, memory.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-cancelled".into(),
            run_id: "run-cancelled".into(),
            status: "cancelled".into(),
        })
        .await;

        let entry = memory
            .get(&flow_namespace("f-cancelled"), "run_digest:run-cancelled")
            .await
            .unwrap();
        assert!(entry.is_none());
    }

    #[tokio::test]
    async fn digest_writes_run_digest_entry_for_completed_run() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let memory = digest_test_memory(&tmp);

        let flow = flow_with_trigger_config("f-ok", true, json!({}));
        store::upsert_flow(&config, &flow).unwrap();
        store::insert_flow_run(
            &config,
            "run-ok",
            "f-ok",
            "thread-ok",
            "2026-01-01T00:00:00Z",
        )
        .unwrap();
        let step = crate::openhuman::flows::FlowRunStep {
            node_id: "n1".to_string(),
            output: json!({ "sent": 3 }),
            port: None,
            status: Some("success".to_string()),
            duration_ms: Some(12),
            diagnostics: Vec::new(),
        };
        store::finish_flow_run(
            &config,
            "run-ok",
            "completed",
            "2026-01-01T00:05:00Z",
            &[step],
            &[],
            None,
        )
        .unwrap();

        let sub = FlowRunDigestSubscriber::with_memory(config, memory.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-ok".into(),
            run_id: "run-ok".into(),
            status: "completed".into(),
        })
        .await;

        let entry = memory
            .get(&flow_namespace("f-ok"), "run_digest:run-ok")
            .await
            .unwrap()
            .expect("completed run must produce a run_digest entry");
        assert_eq!(entry.taint, MemoryTaint::ExternalSync);
        assert!(entry.content.contains("f-ok"));
        assert!(entry.content.contains("completed"));
        assert!(entry.content.contains("n1"));
        assert!(entry.content.chars().count() <= DIGEST_MAX_CHARS);
    }

    #[tokio::test]
    async fn digest_treats_completed_with_warnings_as_success() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let memory = digest_test_memory(&tmp);

        let flow = flow_with_trigger_config("f-warn", true, json!({}));
        store::upsert_flow(&config, &flow).unwrap();
        store::insert_flow_run(
            &config,
            "run-warn",
            "f-warn",
            "thread-warn",
            "2026-01-01T00:00:00Z",
        )
        .unwrap();
        store::finish_flow_run(
            &config,
            "run-warn",
            "completed_with_warnings",
            "2026-01-01T00:05:00Z",
            &[],
            &[],
            None,
        )
        .unwrap();

        let sub = FlowRunDigestSubscriber::with_memory(config, memory.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-warn".into(),
            run_id: "run-warn".into(),
            status: "completed_with_warnings".into(),
        })
        .await;

        let entry = memory
            .get(&flow_namespace("f-warn"), "run_digest:run-warn")
            .await
            .unwrap();
        assert!(entry.is_some());
    }

    #[test]
    fn truncate_chars_bounds_output_and_marks_truncation() {
        let long = "x".repeat(50);
        let truncated = truncate_chars(&long, 10);
        assert_eq!(truncated.chars().count(), 10);
        assert!(truncated.ends_with('…'));

        let short = "hello";
        assert_eq!(truncate_chars(short, 10), "hello");
    }

    #[test]
    fn render_run_digest_is_bounded_and_includes_key_fields() {
        let run = FlowRun {
            id: "run-1".to_string(),
            flow_id: "f1".to_string(),
            thread_id: "thread-1".to_string(),
            status: "completed".to_string(),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            finished_at: Some("2026-01-01T00:05:00Z".to_string()),
            steps: vec![crate::openhuman::flows::FlowRunStep {
                node_id: "n1".to_string(),
                output: json!({ "ok": true }),
                port: None,
                status: Some("success".to_string()),
                duration_ms: Some(5),
                diagnostics: Vec::new(),
            }],
            pending_approvals: Vec::new(),
            error: None,
        };
        let digest = render_run_digest("My Flow", &run);
        assert!(digest.contains("My Flow"));
        assert!(digest.contains("completed"));
        assert!(digest.contains("n1"));
        assert!(digest.chars().count() <= DIGEST_MAX_CHARS);
    }

    // ── DedupCommitSubscriber ────────────────────────────────────────

    fn dedup_state_namespace(flow_id: &str) -> String {
        // MUST match `tinyflows::build_capabilities`'s `state_namespace`
        // (`src/openhuman/tinyflows/caps.rs`) — this test asserts the
        // subscriber collides with the SAME keys the engine's `dedup` node
        // itself reads/writes, not just "some" namespace.
        format!("flow:{flow_id}")
    }

    #[test]
    fn dedup_commit_name_and_domains_are_stable() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = DedupCommitSubscriber::new(test_config(&tmp));
        assert_eq!(sub.name(), "flows::dedup_commit");
        assert_eq!(sub.domains(), Some(&["cron"][..]));
    }

    #[tokio::test]
    async fn dedup_commit_ignores_unrelated_events() {
        let tmp = tempfile::TempDir::new().unwrap();
        let sub = DedupCommitSubscriber::new(test_config(&tmp));
        // Must not panic for any event other than `FlowRunFinished`.
        sub.handle(&DomainEvent::CronJobTriggered {
            job_id: "j1".into(),
            job_name: "test".into(),
            job_type: "shell".into(),
        })
        .await;
    }

    #[tokio::test]
    async fn dedup_commit_flow_with_no_dedup_nodes_is_a_noop() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = flow_with_trigger_config("f-no-dedup", true, json!({}));
        store::upsert_flow(&config, &flow).unwrap();

        let sub = DedupCommitSubscriber::new(config);
        // Must not panic when the flow has no `dedup` node at all.
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-no-dedup".into(),
            run_id: "run-1".into(),
            status: "completed".into(),
        })
        .await;
    }

    #[tokio::test]
    async fn dedup_commit_unions_tentative_into_committed_and_clears_tentative_on_success() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = flow_with_dedup_node("f-ok", "dd");
        store::upsert_flow(&config, &flow).unwrap();

        let namespace = dedup_state_namespace("f-ok");
        store::kv_set(&config, &namespace, "dedup:dd:committed", &json!(["a"])).unwrap();
        store::kv_set(
            &config,
            &namespace,
            "dedup:dd:tentative",
            &json!(["b", "c"]),
        )
        .unwrap();

        let sub = DedupCommitSubscriber::new(config.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-ok".into(),
            run_id: "run-ok".into(),
            status: "completed".into(),
        })
        .await;

        let committed = store::kv_get(&config, &namespace, "dedup:dd:committed")
            .unwrap()
            .expect("committed key must still exist");
        let mut committed: Vec<&str> = committed
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        committed.sort_unstable();
        assert_eq!(committed, vec!["a", "b", "c"], "committed = union");

        assert!(
            store::kv_get(&config, &namespace, "dedup:dd:tentative")
                .unwrap()
                .is_none(),
            "tentative must be cleared after a successful commit"
        );
    }

    #[tokio::test]
    async fn dedup_commit_treats_completed_with_warnings_as_success() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = flow_with_dedup_node("f-warn", "dd");
        store::upsert_flow(&config, &flow).unwrap();

        let namespace = dedup_state_namespace("f-warn");
        store::kv_set(&config, &namespace, "dedup:dd:tentative", &json!(["x"])).unwrap();

        let sub = DedupCommitSubscriber::new(config.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-warn".into(),
            run_id: "run-warn".into(),
            status: "completed_with_warnings".into(),
        })
        .await;

        let committed = store::kv_get(&config, &namespace, "dedup:dd:committed")
            .unwrap()
            .expect("completed_with_warnings must still commit");
        assert_eq!(committed, json!(["x"]));
        assert!(store::kv_get(&config, &namespace, "dedup:dd:tentative")
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn dedup_commit_releases_tentative_without_touching_committed_on_failure() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = flow_with_dedup_node("f-failed", "dd");
        store::upsert_flow(&config, &flow).unwrap();

        let namespace = dedup_state_namespace("f-failed");
        store::kv_set(&config, &namespace, "dedup:dd:committed", &json!(["a"])).unwrap();
        store::kv_set(&config, &namespace, "dedup:dd:tentative", &json!(["b"])).unwrap();

        let sub = DedupCommitSubscriber::new(config.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-failed".into(),
            run_id: "run-failed".into(),
            status: "failed".into(),
        })
        .await;

        assert_eq!(
            store::kv_get(&config, &namespace, "dedup:dd:committed")
                .unwrap()
                .unwrap(),
            json!(["a"]),
            "committed must be untouched by a failed run"
        );
        assert!(
            store::kv_get(&config, &namespace, "dedup:dd:tentative")
                .unwrap()
                .is_none(),
            "tentative must be released (cleared) on failure so the item retries"
        );
    }

    #[tokio::test]
    async fn dedup_commit_releases_tentative_on_cancelled_and_interrupted() {
        for status in ["cancelled", "interrupted"] {
            let tmp = tempfile::TempDir::new().unwrap();
            let config = test_config(&tmp);
            let flow_id = format!("f-{status}");
            let flow = flow_with_dedup_node(&flow_id, "dd");
            store::upsert_flow(&config, &flow).unwrap();

            let namespace = dedup_state_namespace(&flow_id);
            store::kv_set(&config, &namespace, "dedup:dd:tentative", &json!(["z"])).unwrap();

            let sub = DedupCommitSubscriber::new(config.clone());
            sub.handle(&DomainEvent::FlowRunFinished {
                flow_id: flow_id.clone(),
                run_id: format!("run-{status}"),
                status: status.to_string(),
            })
            .await;

            assert!(
                store::kv_get(&config, &namespace, "dedup:dd:committed")
                    .unwrap()
                    .is_none(),
                "status {status} must never commit"
            );
            assert!(
                store::kv_get(&config, &namespace, "dedup:dd:tentative")
                    .unwrap()
                    .is_none(),
                "status {status} must release tentative"
            );
        }
    }

    #[tokio::test]
    async fn dedup_commit_two_dedup_nodes_settle_independently() {
        let tmp = tempfile::TempDir::new().unwrap();
        let config = test_config(&tmp);
        let flow = Flow {
            id: "f-multi".to_string(),
            name: "f-multi".to_string(),
            enabled: true,
            graph: WorkflowGraph {
                nodes: vec![
                    trigger_node(json!({})),
                    dedup_node("dd1"),
                    dedup_node("dd2"),
                ],
                ..Default::default()
            },
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            last_run_at: None,
            last_status: None,
            require_approval: false,
        };
        store::upsert_flow(&config, &flow).unwrap();

        let namespace = dedup_state_namespace("f-multi");
        store::kv_set(&config, &namespace, "dedup:dd1:tentative", &json!(["a"])).unwrap();
        store::kv_set(&config, &namespace, "dedup:dd2:tentative", &json!(["b"])).unwrap();

        let sub = DedupCommitSubscriber::new(config.clone());
        sub.handle(&DomainEvent::FlowRunFinished {
            flow_id: "f-multi".into(),
            run_id: "run-multi".into(),
            status: "completed".into(),
        })
        .await;

        assert_eq!(
            store::kv_get(&config, &namespace, "dedup:dd1:committed")
                .unwrap()
                .unwrap(),
            json!(["a"])
        );
        assert_eq!(
            store::kv_get(&config, &namespace, "dedup:dd2:committed")
                .unwrap()
                .unwrap(),
            json!(["b"])
        );
    }
}
