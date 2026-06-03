//! Startup reconciliation of Composio connections into the memory sources registry.
//!
//! Called once at boot to ensure all active Composio sync targets have
//! a corresponding `MemorySourceEntry` in config. This catches connections
//! created before the memory_sources domain existed.
//!
//! Also owns the one-time retroactive migration
//! (`apply_composio_source_caps_migration`) that enables previously-disabled
//! Composio sources with conservative per-toolkit caps.

use crate::openhuman::config::rpc as config_rpc;
use crate::openhuman::memory_sources::registry;
use crate::openhuman::memory_sources::types::SourceKind;
use crate::openhuman::memory_sync::composio;

pub async fn ensure_composio_sources() {
    tracing::debug!("[memory_sources:reconcile] starting composio reconciliation");

    let config = match config_rpc::load_config_with_timeout().await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(
                error = %e,
                "[memory_sources:reconcile] failed to load config; skipping"
            );
            return;
        }
    };

    // Always hit Composio directly here — using list_sync_targets would
    // short-circuit through the registry and miss new connections.
    let targets = match composio::scan_active_sync_targets(&config).await {
        Ok(t) => t,
        Err(e) => {
            tracing::debug!(
                error = %e,
                "[memory_sources:reconcile] no composio sync targets available; skipping"
            );
            return;
        }
    };

    let mut upserted = 0u32;
    for target in &targets {
        // Use a title-cased toolkit name plus the truncated connection id
        // so distinct Gmail accounts don't all show as "Gmail connection".
        let label = format!(
            "{} · {}",
            title_case(&target.toolkit),
            short_id(&target.connection_id)
        );
        match registry::upsert_composio_source(&target.toolkit, &target.connection_id, &label).await
        {
            Ok(_) => {
                upserted += 1;
            }
            Err(e) => {
                tracing::warn!(
                    toolkit = %target.toolkit,
                    connection_id = %target.connection_id,
                    error = %e,
                    "[memory_sources:reconcile] upsert failed"
                );
            }
        }
    }

    if !targets.is_empty() {
        tracing::info!(
            targets = targets.len(),
            upserted = upserted,
            "[memory_sources:reconcile] composio reconciliation complete"
        );
    }

    // Run the one-time caps migration after the reconcile loop so any
    // sources upserted just above are also considered.
    if let Err(e) = apply_composio_source_caps_migration().await {
        tracing::warn!(
            error = %e,
            "[memory_sources:reconcile] caps migration failed (non-fatal, will retry next time)"
        );
    }
}

/// One-time retroactive migration: flip previously-disabled Composio sources
/// that have no caps to `enabled = true` with conservative per-toolkit defaults.
///
/// Guarded by `Config.composio_source_caps_migrated` — runs at most once per
/// install. Idempotent within a single run: only processes entries where BOTH
/// `enabled == false` AND `max_items.is_none() && sync_depth_days.is_none()`.
/// Entries the user has already customised (non-None caps) are left untouched.
pub async fn apply_composio_source_caps_migration() -> Result<(), String> {
    let mut config = config_rpc::load_config_with_timeout().await?;

    if config.composio_source_caps_migrated {
        tracing::debug!("[memory_sources:reconcile] caps migration already applied; skipping");
        return Ok(());
    }

    tracing::info!("[memory_sources:reconcile] applying composio source caps migration");

    let mut migrated_count = 0u32;

    for source in &mut config.memory_sources {
        match source.kind {
            SourceKind::Composio => {
                // Only migrate entries that are disabled AND have no caps set
                // (i.e. the user has not customised them).
                if !source.enabled && source.max_items.is_none() && source.sync_depth_days.is_none()
                {
                    let toolkit = source.toolkit.as_deref().unwrap_or("");
                    let (max_items, sync_depth_days) =
                        registry::composio_defaults_for_toolkit(toolkit);
                    tracing::debug!(
                        id = %source.id,
                        toolkit = %toolkit,
                        max_items = ?max_items,
                        sync_depth_days = ?sync_depth_days,
                        "[memory_sources:reconcile] caps migration: enabling disabled source with defaults"
                    );
                    source.enabled = true;
                    source.max_items = max_items;
                    source.sync_depth_days = sync_depth_days;
                    migrated_count += 1;
                }
            }
            // Apply non-composio kind defaults for entries with all-None caps.
            _ => {
                // Use the rpc::apply_kind_defaults helper so the same
                // conservative values are applied consistently.
                crate::openhuman::memory_sources::rpc::apply_kind_defaults(source);
            }
        }
    }

    config.composio_source_caps_migrated = true;
    config
        .save()
        .await
        .map_err(|e| format!("caps migration: failed to save config: {e:#}"))?;

    tracing::info!(
        migrated = migrated_count,
        "[memory_sources:reconcile] caps migration complete"
    );

    Ok(())
}

fn title_case(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().chain(chars).collect(),
    }
}

fn short_id(id: &str) -> &str {
    // Show only the last 8 Unicode scalar values to keep labels compact.
    // Byte-slicing would panic if the cut point isn't a UTF-8 boundary.
    let n = id.chars().count();
    if n <= 8 {
        return id;
    }
    let skip = n - 8;
    let start = id.char_indices().nth(skip).map(|(idx, _)| idx).unwrap_or(0);
    &id[start..]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openhuman::memory_sources::types::{MemorySourceEntry, SourceKind};

    fn make_composio_entry(
        id: &str,
        toolkit: &str,
        enabled: bool,
        max_items: Option<u32>,
        sync_depth_days: Option<u32>,
    ) -> MemorySourceEntry {
        MemorySourceEntry {
            id: id.to_string(),
            kind: SourceKind::Composio,
            label: toolkit.to_string(),
            enabled,
            toolkit: Some(toolkit.to_string()),
            connection_id: Some(format!("conn_{id}")),
            path: None,
            glob: None,
            url: None,
            branch: None,
            paths: Vec::new(),
            max_commits: None,
            max_issues: None,
            max_prs: None,
            query: None,
            since_days: None,
            max_items,
            selector: None,
            max_tokens_per_sync: None,
            max_cost_per_sync_usd: None,
            sync_depth_days,
        }
    }

    /// Simulate the migration logic applied to a Vec of sources so we can
    /// test the transformation without touching the global config.
    fn run_migration_on_entries(sources: &mut Vec<MemorySourceEntry>) -> u32 {
        let mut migrated = 0u32;
        for source in sources.iter_mut() {
            if source.kind == SourceKind::Composio
                && !source.enabled
                && source.max_items.is_none()
                && source.sync_depth_days.is_none()
            {
                let toolkit = source.toolkit.as_deref().unwrap_or("");
                let (max_items, sync_depth_days) = registry::composio_defaults_for_toolkit(toolkit);
                source.enabled = true;
                source.max_items = max_items;
                source.sync_depth_days = sync_depth_days;
                migrated += 1;
            }
        }
        migrated
    }

    #[test]
    fn migration_flips_disabled_capless_entry_to_enabled_with_caps() {
        let mut sources = vec![make_composio_entry("s1", "gmail", false, None, None)];
        let count = run_migration_on_entries(&mut sources);
        assert_eq!(count, 1);
        assert!(sources[0].enabled);
        assert_eq!(sources[0].max_items, Some(100));
        assert_eq!(sources[0].sync_depth_days, Some(30));
    }

    #[test]
    fn migration_leaves_already_enabled_entry_untouched() {
        let mut sources = vec![make_composio_entry("s2", "slack", true, None, None)];
        let count = run_migration_on_entries(&mut sources);
        // Already enabled — migration predicate requires enabled == false.
        assert_eq!(count, 0);
        assert!(sources[0].enabled);
        // Caps should still be None (we didn't touch it).
        assert_eq!(sources[0].max_items, None);
    }

    #[test]
    fn migration_leaves_user_customised_caps_untouched() {
        // User set max_items explicitly → migration should not override.
        let mut sources = vec![make_composio_entry("s3", "notion", false, Some(5), None)];
        let count = run_migration_on_entries(&mut sources);
        assert_eq!(count, 0, "entry with user-set caps must not be migrated");
        assert!(!sources[0].enabled, "enabled must not be flipped");
        assert_eq!(sources[0].max_items, Some(5), "user cap must be preserved");
    }

    #[test]
    fn migration_is_noop_on_empty_list() {
        let mut sources: Vec<MemorySourceEntry> = vec![];
        let count = run_migration_on_entries(&mut sources);
        assert_eq!(count, 0);
    }

    #[test]
    fn migration_applies_correct_defaults_per_toolkit() {
        let toolkits = [
            ("gmail", Some(100u32), Some(30u32)),
            ("slack", Some(50), Some(14)),
            ("notion", Some(30), Some(30)),
            ("linear", Some(50), Some(30)),
            ("clickup", Some(50), Some(30)),
            ("github", Some(50), Some(30)),
            ("unknown", Some(30), Some(14)),
        ];
        for (toolkit, exp_items, exp_days) in &toolkits {
            let mut sources = vec![make_composio_entry("sid", toolkit, false, None, None)];
            run_migration_on_entries(&mut sources);
            assert_eq!(
                sources[0].max_items, *exp_items,
                "max_items mismatch for toolkit={toolkit}"
            );
            assert_eq!(
                sources[0].sync_depth_days, *exp_days,
                "sync_depth_days mismatch for toolkit={toolkit}"
            );
        }
    }

    #[test]
    fn short_id_truncates_ascii() {
        assert_eq!(short_id("ca_WaktIDFlZwXO"), "IDFlZwXO");
    }

    #[test]
    fn short_id_short_input_passthrough() {
        assert_eq!(short_id("abc"), "abc");
        assert_eq!(short_id("12345678"), "12345678");
    }

    #[test]
    fn short_id_utf8_safe() {
        // Multi-byte chars would have panicked with byte-slicing.
        let s = "🦀🐢🐙🦊🐼🐰🐯🐸🦁";
        let out = short_id(s);
        assert_eq!(out.chars().count(), 8);
    }
}
