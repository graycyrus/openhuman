use super::*;

// ── TAURI-RUST-A regression tests ────────────────────────────────────────────
// Verify that the sentinel string is stable. The global `DDL_EVER_FAILED` flag
// cannot be unit-tested in isolation (process-global, permanent once set), so
// we only test properties that are safe to check without mutating global state.

#[test]
fn db_init_failed_sentinel_is_non_empty_and_prefixed() {
    // Sentinel must be non-empty and carry the [subconscious] grep prefix so
    // `is_db_init_failed` in schemas.rs can match it reliably.
    assert!(!DB_INIT_FAILED_SENTINEL.is_empty());
    assert!(
        DB_INIT_FAILED_SENTINEL.contains("[subconscious]"),
        "sentinel must carry [subconscious] grep prefix, got: {DB_INIT_FAILED_SENTINEL}"
    );
    assert!(
        DB_INIT_FAILED_SENTINEL.contains("db unavailable"),
        "sentinel must carry 'db unavailable' so UI can distinguish init failures from query failures"
    );
}

fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(SCHEMA_DDL).unwrap();
    conn
}

#[test]
fn crud_tasks() {
    let conn = test_conn();
    let task = add_task(&conn, "Check email", TaskSource::User, TaskRecurrence::Once).unwrap();
    assert_eq!(task.title, "Check email");
    assert!(!task.completed);

    let fetched = get_task(&conn, &task.id).unwrap();
    assert_eq!(fetched.title, "Check email");

    let all = list_tasks(&conn, false).unwrap();
    assert_eq!(all.len(), 1);

    update_task(
        &conn,
        &task.id,
        &TaskPatch {
            title: Some("Check Gmail".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let updated = get_task(&conn, &task.id).unwrap();
    assert_eq!(updated.title, "Check Gmail");

    mark_task_completed(&conn, &task.id).unwrap();
    let done = get_task(&conn, &task.id).unwrap();
    assert!(done.completed);

    remove_task(&conn, &task.id).unwrap();
    assert!(get_task(&conn, &task.id).is_err());
}

#[test]
fn due_tasks_filters_correctly() {
    let conn = test_conn();
    let now = now_secs();

    // Task with no next_run_at — should be due
    add_task(
        &conn,
        "No schedule",
        TaskSource::User,
        TaskRecurrence::Pending,
    )
    .unwrap();

    // Task with future next_run_at — should NOT be due
    let future_task =
        add_task(&conn, "Future task", TaskSource::User, TaskRecurrence::Once).unwrap();
    update_task_run_times(&conn, &future_task.id, now, Some(now + 3600.0)).unwrap();

    // Task with past next_run_at — should be due
    let past_task = add_task(&conn, "Past due", TaskSource::User, TaskRecurrence::Once).unwrap();
    update_task_run_times(&conn, &past_task.id, now - 7200.0, Some(now - 3600.0)).unwrap();

    let due = due_tasks(&conn, now).unwrap();
    assert_eq!(due.len(), 2); // "No schedule" + "Past due"
    assert!(due.iter().any(|t| t.title == "No schedule"));
    assert!(due.iter().any(|t| t.title == "Past due"));
    assert!(!due.iter().any(|t| t.title == "Future task"));
}

#[test]
fn crud_log_entries() {
    let conn = test_conn();
    let task = add_task(&conn, "Test", TaskSource::User, TaskRecurrence::Once).unwrap();
    let now = now_secs();

    let entry = add_log_entry(
        &conn,
        &task.id,
        now,
        "act",
        Some("Did the thing"),
        Some(150),
    )
    .unwrap();
    assert_eq!(entry.decision, "act");

    let entries = list_log_entries(&conn, Some(&task.id), 10).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].result.as_deref(), Some("Did the thing"));

    let all_entries = list_log_entries(&conn, None, 10).unwrap();
    assert_eq!(all_entries.len(), 1);
}

#[test]
fn crud_escalations() {
    let conn = test_conn();
    let task = add_task(&conn, "Test", TaskSource::User, TaskRecurrence::Once).unwrap();

    let esc = add_escalation(
        &conn,
        &task.id,
        None,
        "Deadline moved",
        "The API deadline was moved to tomorrow",
        &EscalationPriority::Critical,
    )
    .unwrap();
    assert_eq!(esc.status, EscalationStatus::Pending);

    let pending = list_escalations(&conn, Some(&EscalationStatus::Pending)).unwrap();
    assert_eq!(pending.len(), 1);

    assert_eq!(pending_escalation_count(&conn).unwrap(), 1);

    resolve_escalation(&conn, &esc.id, &EscalationStatus::Approved).unwrap();
    let resolved = get_escalation(&conn, &esc.id).unwrap();
    assert_eq!(resolved.status, EscalationStatus::Approved);
    assert!(resolved.resolved_at.is_some());

    assert_eq!(pending_escalation_count(&conn).unwrap(), 0);
}

#[test]
fn seed_default_tasks_creates_system_tasks() {
    let conn = test_conn();

    let count = seed_default_tasks(&conn).unwrap();
    assert_eq!(count, DEFAULT_SYSTEM_TASKS.len());

    // Second seed should not duplicate
    let count2 = seed_default_tasks(&conn).unwrap();
    assert_eq!(count2, 0);

    let tasks = list_tasks(&conn, false).unwrap();
    assert_eq!(tasks.len(), DEFAULT_SYSTEM_TASKS.len());
    assert!(tasks.iter().all(|t| t.source == TaskSource::System));
}

#[test]
fn recurrence_roundtrip() {
    assert_eq!(
        string_to_recurrence(&recurrence_to_string(&TaskRecurrence::Once)),
        TaskRecurrence::Once
    );
    assert_eq!(
        string_to_recurrence(&recurrence_to_string(&TaskRecurrence::Pending)),
        TaskRecurrence::Pending
    );
    assert_eq!(
        string_to_recurrence(&recurrence_to_string(&TaskRecurrence::Cron(
            "0 8 * * *".into()
        ))),
        TaskRecurrence::Cron("0 8 * * *".into())
    );
}
