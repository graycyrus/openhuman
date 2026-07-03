use super::*;
use crate::openhuman::config::Config;
use serde_json::json;
use tempfile::TempDir;

fn test_config(tmp: &TempDir) -> Config {
    let config = Config {
        workspace_dir: tmp.path().join("workspace"),
        action_dir: tmp.path().join("workspace"),
        config_path: tmp.path().join("config.toml"),
        ..Config::default()
    };
    std::fs::create_dir_all(&config.workspace_dir).unwrap();
    config
}

fn trigger_only_graph() -> Value {
    json!({
        "name": "trigger-only",
        "nodes": [
            { "id": "t", "kind": "trigger", "name": "Trigger" }
        ],
        "edges": []
    })
}

#[tokio::test]
async fn flows_create_rejects_graph_without_trigger() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);

    let graph_without_trigger = json!({
        "name": "bad",
        "nodes": [ { "id": "a", "kind": "output_parser", "name": "A" } ],
        "edges": []
    });

    let err = flows_create(&config, "bad".to_string(), graph_without_trigger, false)
        .await
        .expect_err("graph without a trigger must be rejected");
    assert!(
        err.contains("trigger"),
        "expected a MissingTrigger-style error, got: {err}"
    );
}

#[tokio::test]
async fn flows_create_get_list_delete_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);

    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();
    let flow_id = created.value.id.clone();

    let fetched = flows_get(&config, &flow_id).await.unwrap();
    assert_eq!(fetched.value.id, flow_id);
    assert_eq!(fetched.value.name, "demo");

    let listed = flows_list(&config).await.unwrap();
    assert_eq!(listed.value.len(), 1);

    flows_delete(&config, &flow_id).await.unwrap();
    assert!(flows_get(&config, &flow_id).await.is_err());
    assert!(flows_list(&config).await.unwrap().value.is_empty());
}

#[tokio::test]
async fn flows_set_enabled_toggles() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();
    assert!(created.value.enabled);

    let disabled = flows_set_enabled(&config, &created.value.id, false)
        .await
        .unwrap();
    assert!(!disabled.value.enabled);

    let enabled = flows_set_enabled(&config, &created.value.id, true)
        .await
        .unwrap();
    assert!(enabled.value.enabled);
}

#[tokio::test]
async fn flows_update_replaces_name_and_graph() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();

    let mut new_graph = trigger_only_graph();
    new_graph["name"] = json!("renamed-graph");

    let updated = flows_update(
        &config,
        &created.value.id,
        Some("renamed".to_string()),
        Some(new_graph),
        None,
    )
    .await
    .unwrap();

    assert_eq!(updated.value.name, "renamed");
    assert_eq!(updated.value.graph.name, "renamed-graph");
}

#[tokio::test]
async fn flows_update_can_set_require_approval() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();
    assert!(!created.value.require_approval);

    let updated = flows_update(&config, &created.value.id, None, None, Some(true))
        .await
        .unwrap();
    assert!(updated.value.require_approval);

    // Omitting `require_approval` on a later update preserves the current value.
    let unchanged = flows_update(&config, &created.value.id, None, None, None)
        .await
        .unwrap();
    assert!(unchanged.value.require_approval);
}

#[tokio::test]
async fn flows_update_rejects_invalid_replacement_graph() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();

    let invalid_graph = json!({
        "name": "no-trigger",
        "nodes": [ { "id": "a", "kind": "output_parser", "name": "A" } ],
        "edges": []
    });

    let err = flows_update(&config, &created.value.id, None, Some(invalid_graph), None)
        .await
        .expect_err("invalid replacement graph must be rejected");
    assert!(err.contains("trigger"));
}

#[tokio::test]
async fn flows_run_completes_trigger_only_graph() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();

    let outcome = flows_run(&config, &created.value.id, json!({ "hello": "world" }))
        .await
        .unwrap();

    assert_eq!(outcome.value["pending_approvals"], json!([]));
    assert_eq!(
        outcome.value["output"]["run"]["trigger"],
        json!({ "hello": "world" })
    );

    let reloaded = flows_get(&config, &created.value.id).await.unwrap();
    assert_eq!(reloaded.value.last_status.as_deref(), Some("completed"));
    assert!(reloaded.value.last_run_at.is_some());
}

#[tokio::test]
async fn flows_run_reports_pending_approval_and_blocks_downstream() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);

    let graph = json!({
        "name": "approval-gated",
        "nodes": [
            { "id": "t", "kind": "trigger", "name": "Trigger" },
            { "id": "gate", "kind": "output_parser", "name": "Gate", "config": { "requires_approval": true } },
            { "id": "downstream", "kind": "output_parser", "name": "Downstream" }
        ],
        "edges": [
            { "from_node": "t", "to_node": "gate" },
            { "from_node": "gate", "to_node": "downstream" }
        ]
    });

    let created = flows_create(&config, "gated".to_string(), graph, false)
        .await
        .unwrap();

    let outcome = flows_run(&config, &created.value.id, json!({ "x": 1 }))
        .await
        .unwrap();

    let pending = outcome.value["pending_approvals"].as_array().unwrap();
    assert!(pending.iter().any(|v| v == "gate"));
    assert!(outcome.value["output"]["nodes"]["downstream"].is_null());

    let reloaded = flows_get(&config, &created.value.id).await.unwrap();
    assert_eq!(
        reloaded.value.last_status.as_deref(),
        Some("pending_approval")
    );
}

#[tokio::test]
async fn flows_get_missing_flow_errors() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let err = flows_get(&config, "missing").await.expect_err("must error");
    assert!(err.contains("not found"));
}

#[tokio::test]
async fn flows_run_missing_flow_errors() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let err = flows_run(&config, "missing", json!({}))
        .await
        .expect_err("must error");
    assert!(err.contains("not found"));
}

#[tokio::test]
async fn flows_run_records_failed_status_when_a_node_errors() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);

    // A `tool_call` with no `slug` errors in the node executor before reaching
    // any external service; with the default `on_error: stop` the whole run
    // fails deterministically — no network/credentials needed.
    let graph = json!({
        "name": "boom",
        "nodes": [
            { "id": "t", "kind": "trigger", "name": "Trigger" },
            { "id": "x", "kind": "tool_call", "name": "X" }
        ],
        "edges": [ { "from_node": "t", "to_node": "x" } ]
    });

    let created = flows_create(&config, "boom".to_string(), graph, false)
        .await
        .unwrap();

    let err = flows_run(&config, &created.value.id, json!({}))
        .await
        .expect_err("a run whose node errors under on_error:stop must fail");
    assert!(!err.is_empty());

    // The failed attempt must be recorded, not left on the prior state.
    let reloaded = flows_get(&config, &created.value.id).await.unwrap();
    assert_eq!(
        reloaded.value.last_status.as_deref(),
        Some("failed"),
        "a failed run must record last_status=failed"
    );
    assert!(
        reloaded.value.last_run_at.is_some(),
        "a failed run must stamp last_run_at"
    );
}

// ── flows_resume (issue B2) ───────────────────────────────────────────────

fn approval_gated_graph() -> Value {
    json!({
        "name": "approval-gated",
        "nodes": [
            { "id": "t", "kind": "trigger", "name": "Trigger" },
            { "id": "gate", "kind": "output_parser", "name": "Gate", "config": { "requires_approval": true } },
            { "id": "downstream", "kind": "output_parser", "name": "Downstream" }
        ],
        "edges": [
            { "from_node": "t", "to_node": "gate" },
            { "from_node": "gate", "to_node": "downstream" }
        ]
    })
}

#[tokio::test]
async fn flows_resume_continues_a_paused_run_to_completion() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "gated".to_string(), approval_gated_graph(), false)
        .await
        .unwrap();

    let run = flows_run(&config, &created.value.id, json!({ "x": 1 }))
        .await
        .unwrap();
    let thread_id = run.value["thread_id"].as_str().unwrap().to_string();
    let pending: Vec<String> =
        serde_json::from_value(run.value["pending_approvals"].clone()).unwrap();
    assert_eq!(pending, vec!["gate".to_string()]);

    let resumed = flows_resume(&config, &created.value.id, &thread_id, pending)
        .await
        .unwrap();
    assert_eq!(resumed.value["pending_approvals"], json!([]));
    assert!(
        !resumed.value["output"]["nodes"]["downstream"]["items"].is_null(),
        "downstream should run once the gate is approved via resume"
    );

    let reloaded = flows_get(&config, &created.value.id).await.unwrap();
    assert_eq!(reloaded.value.last_status.as_deref(), Some("completed"));

    // The run-history row must reflect the final completed status, not the
    // intermediate pending_approval one it started at.
    let run_row = flows_get_run(&config, &thread_id).await.unwrap();
    assert_eq!(run_row.value.status, "completed");
    assert!(run_row.value.pending_approvals.is_empty());
    assert!(
        run_row
            .value
            .steps
            .iter()
            .any(|s| s.node_id == "downstream"),
        "resume should reconstruct the downstream step that ran after approval"
    );
}

#[tokio::test]
async fn flows_resume_missing_flow_errors() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let err = flows_resume(&config, "missing", "thread-1", vec![])
        .await
        .expect_err("must error");
    assert!(err.contains("not found"));
}

// ── run history (flows_list_runs / flows_get_run) ────────────────────────

#[tokio::test]
async fn flows_run_persists_a_flow_run_row_queryable_via_list_and_get() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let created = flows_create(&config, "demo".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();

    let run = flows_run(&config, &created.value.id, json!({ "hello": "world" }))
        .await
        .unwrap();
    let thread_id = run.value["thread_id"].as_str().unwrap().to_string();

    let runs = flows_list_runs(&config, &created.value.id, 20)
        .await
        .unwrap();
    assert_eq!(runs.value.len(), 1);
    assert_eq!(runs.value[0].id, thread_id);
    assert_eq!(runs.value[0].status, "completed");

    let single = flows_get_run(&config, &thread_id).await.unwrap();
    assert_eq!(single.value.flow_id, created.value.id);
    assert_eq!(single.value.status, "completed");
    assert!(
        single.value.steps.iter().any(|s| s.node_id == "t"),
        "the trigger node's step should be reconstructed from output[\"nodes\"]"
    );
}

#[tokio::test]
async fn flows_get_run_missing_run_errors() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let err = flows_get_run(&config, "missing-run")
        .await
        .expect_err("must error");
    assert!(err.contains("not found"));
}

// ── pending-approval notification ────────────────────────────────────────

#[tokio::test]
async fn flows_run_emits_pending_approval_notification() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let mut rx = crate::openhuman::notifications::bus::subscribe_core_notifications();

    let created = flows_create(
        &config,
        "gated-notify".to_string(),
        approval_gated_graph(),
        false,
    )
    .await
    .unwrap();

    let run = flows_run(&config, &created.value.id, json!({}))
        .await
        .unwrap();
    let thread_id = run.value["thread_id"].as_str().unwrap().to_string();

    // Filter for our notification specifically — the broadcast bus is
    // process-global, so a concurrently-running test's notification could
    // otherwise be received first.
    let expected_prefix = format!("flow-pending-approval:{}:", created.value.id);
    let mut found = None;
    for _ in 0..20 {
        match tokio::time::timeout(std::time::Duration::from_millis(500), rx.recv()).await {
            Ok(Ok(n)) if n.id.starts_with(&expected_prefix) => {
                found = Some(n);
                break;
            }
            Ok(Ok(_unrelated)) => continue,
            _ => break,
        }
    }
    let notification = found.expect("expected a pending-approval notification for this flow");

    assert_eq!(
        notification.category,
        crate::openhuman::notifications::types::CoreNotificationCategory::Agents
    );
    let actions = notification
        .actions
        .expect("pending-approval notification must carry an action");
    let approve = actions
        .iter()
        .find(|a| a.action_id == "approve")
        .expect("expected an 'approve' action");
    let payload = approve
        .payload
        .clone()
        .expect("approve action must carry a payload");
    assert_eq!(payload["flow_id"], json!(created.value.id));
    assert_eq!(payload["thread_id"], json!(thread_id));
    assert_eq!(payload["node_ids"], json!(["gate"]));
}

#[tokio::test]
async fn flows_run_does_not_notify_when_run_completes_without_pending_approvals() {
    let tmp = TempDir::new().unwrap();
    let config = test_config(&tmp);
    let mut rx = crate::openhuman::notifications::bus::subscribe_core_notifications();

    let created = flows_create(&config, "no-gate".to_string(), trigger_only_graph(), false)
        .await
        .unwrap();
    let created_id = created.value.id.clone();

    flows_run(&config, &created.value.id, json!({}))
        .await
        .unwrap();

    let expected_prefix = format!("flow-pending-approval:{created_id}:");
    let saw_notification = tokio::time::timeout(std::time::Duration::from_millis(300), async {
        loop {
            match rx.recv().await {
                Ok(n) if n.id.starts_with(&expected_prefix) => return true,
                Ok(_) => continue,
                Err(_) => return false,
            }
        }
    })
    .await
    .unwrap_or(false);
    assert!(
        !saw_notification,
        "a fully-completed run must not publish a pending-approval notification"
    );
}
