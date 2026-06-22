//! Seed default proactive agent cron jobs.
//!
//! Called once after onboarding completes to create:
//! - A recurring daily morning briefing job (7 AM, user's local time or UTC)
//!
//! The morning briefing uses `mode: "proactive"` delivery so the
//! channels module's
//! [`crate::openhuman::channels::proactive::ProactiveMessageSubscriber`]
//! routes to the user's active channel.
//!
//! The one-shot welcome message used to be seeded here too. It is now
//! delivered by the renderer firing a hidden `chat_send` trigger through
//! the normal dispatch path immediately after onboarding completes (see
//! `OnboardingLayout.completeAndExit`) — no cron round-trip needed.
//! Users who seeded the legacy welcome job under a prior build have any
//! stale entry pruned here (see [`prune_legacy_welcome`]) so the
//! scheduler can't double-deliver.

use crate::openhuman::config::Config;
use crate::openhuman::cron::{
    add_agent_job_with_definition, dedup_named_jobs, list_jobs, pause_job, remove_job,
    DeliveryConfig, Schedule, SessionTarget,
};
use anyhow::Result;

/// Well-known job names used to detect whether seeding has already run.
const MORNING_BRIEFING_JOB_NAME: &str = "morning_briefing";

/// Well-known name of the opt-in autonomous tiny.place bounty worker job.
const BOUNTY_WORKER_JOB_NAME: &str = "bounty_worker";

/// Legacy name of the one-shot welcome cron job created by earlier
/// builds of `seed_proactive_agents`. Kept as a constant (rather than
/// a string literal inline) so a grep for `WELCOME_JOB_NAME` still
/// finds the migration path.
const LEGACY_WELCOME_JOB_NAME: &str = "welcome";

/// Delivery config for proactive agents. The channels module decides
/// which channel(s) to deliver to based on the user's active channel
/// preference — no channel is specified here.
fn proactive_delivery() -> DeliveryConfig {
    DeliveryConfig {
        mode: "proactive".to_string(),
        channel: None,
        to: None,
        best_effort: true,
    }
}

/// Seed the proactive agent cron jobs after onboarding completes.
///
/// Idempotent: skips creation if jobs with matching names already exist.
/// Also prunes any stale one-shot `welcome` job a prior build might
/// have persisted (see [`prune_legacy_welcome`]).
pub fn seed_proactive_agents(config: &Config) -> Result<()> {
    // Remove any duplicate named jobs left behind by older builds that
    // used a non-atomic check-then-insert. Best-effort: log but continue
    // on error so a dedup failure never blocks seeding.
    if let Err(e) = dedup_named_jobs(config) {
        tracing::warn!(
            error = %e,
            "[cron::seed] dedup_named_jobs failed — continuing without dedup"
        );
    }

    let existing = list_jobs(config)?;
    let has = |name: &str| existing.iter().any(|j| j.name.as_deref() == Some(name));

    // Prune before re-listing so a legacy welcome job left over from
    // an interrupted prior run can't deliver a second welcome.
    prune_legacy_welcome(config, &existing);

    if !has(MORNING_BRIEFING_JOB_NAME) {
        tracing::info!("[cron::seed] creating morning_briefing daily cron job");
        seed_morning_briefing(config)?;
    } else {
        tracing::debug!("[cron::seed] morning_briefing job already exists — skipping");
    }

    if !has(BOUNTY_WORKER_JOB_NAME) {
        tracing::info!("[cron::seed] creating bounty_worker agent cron job (disabled — opt-in)");
        seed_bounty_worker(config)?;
    } else {
        tracing::debug!("[cron::seed] bounty_worker job already exists — skipping");
    }

    Ok(())
}

/// Remove any persisted cron job named `"welcome"` from a prior build.
///
/// The one-shot welcome job `delete_after_run = true + Schedule::At`
/// self-cleans on success, but if the scheduler never got a chance to
/// fire it (upgrade mid-window, scheduler disabled, process killed
/// before the 10-second fire-at) the entry can persist. The welcome
/// is now delivered by the renderer firing a hidden `chat_send`
/// trigger through the normal dispatch path right after onboarding
/// completes (see `OnboardingLayout.completeAndExit`); letting a stale
/// cron entry fire alongside that would double-deliver. Best-effort:
/// log but don't fail seeding on a prune error, and scan all entries
/// because the ID is a UUID — we key on the stable `name` field.
fn prune_legacy_welcome(config: &Config, existing: &[crate::openhuman::cron::CronJob]) {
    let stale_ids: Vec<String> = existing
        .iter()
        .filter(|j| j.name.as_deref() == Some(LEGACY_WELCOME_JOB_NAME))
        .map(|j| j.id.clone())
        .collect();

    if stale_ids.is_empty() {
        return;
    }

    tracing::info!(
        count = stale_ids.len(),
        "[cron::seed] pruning legacy '{LEGACY_WELCOME_JOB_NAME}' cron job(s) — welcome is now delivered immediately"
    );
    for id in stale_ids {
        if let Err(e) = remove_job(config, &id) {
            tracing::warn!(
                job_id = %id,
                error = %e,
                "[cron::seed] failed to remove legacy welcome cron job — continuing"
            );
        }
    }
}

/// Daily morning briefing at 7:00 AM in the device-local timezone
/// (unless a timezone is later set explicitly).
/// The cron expression `0 7 * * *` fires once per day. Users can later
/// adjust the schedule or time zone via `cron.update_job`.
fn seed_morning_briefing(config: &Config) -> Result<()> {
    let schedule = Schedule::Cron {
        expr: "0 7 * * *".to_string(),
        tz: None,
        active_hours: None,
    };

    let prompt = concat!(
        "You are the morning briefing agent. Prepare a concise morning ",
        "summary for the user. Review their calendar, tasks, emails, and ",
        "any relevant context from connected integrations. Deliver a warm, ",
        "efficient briefing they can scan in 30 seconds over coffee."
    );

    add_agent_job_with_definition(
        config,
        Some(MORNING_BRIEFING_JOB_NAME.to_string()),
        schedule,
        prompt,
        SessionTarget::Isolated,
        None,
        Some(proactive_delivery()),
        false, // recurring — do not delete after run
        Some(MORNING_BRIEFING_JOB_NAME.to_string()),
    )?;

    Ok(())
}

/// Seed the autonomous tiny.place bounty worker as a recurring (hourly) agent
/// job — created **disabled**.
///
/// This is opt-in for a reason: the worker is the full-capability `bounty_worker`
/// agent (wildcard tools) and runs unattended via cron, which bypasses the
/// approval gate — so it can take paid/irreversible actions on its own, and
/// money on tiny.place is real x402/SPL spend. The safety rails are therefore
/// (1) this opt-in toggle, off by default until the user enables it via the
/// Settings switch (cron.update_job → enabled=true), and (2) the devnet-first,
/// be-prudent guidance baked into the agent's prompt.
///
/// Runs in an isolated session with `proactive` delivery so each cycle's report
/// (which bounties it attempted, submission URLs/IDs, anything it funded)
/// reaches the user's active channel via the channels module's
/// `ProactiveMessageSubscriber`.
fn seed_bounty_worker(config: &Config) -> Result<()> {
    let schedule = Schedule::Every {
        every_ms: 60 * 60 * 1000, // hourly
    };

    let prompt = concat!(
        "Run your autonomous bounty loop. Confirm your identity, recall which ",
        "bounties you've already attempted, discover open tiny.place bounties, ",
        "skip the ones you've done, pick the top 1-2 that fit your skills, do ",
        "the work, publish each deliverable to your feed, and submit it. You may ",
        "take paid actions when worthwhile — be prudent with funds and prefer ",
        "devnet. Report what you attempted with the submission URLs and IDs."
    );

    let job = add_agent_job_with_definition(
        config,
        Some(BOUNTY_WORKER_JOB_NAME.to_string()),
        schedule,
        prompt,
        SessionTarget::Isolated,
        None,
        Some(proactive_delivery()),
        false, // recurring — do not delete after run
        Some(BOUNTY_WORKER_JOB_NAME.to_string()),
    )?;

    // Opt-in: the job is created disabled. The user enables it explicitly via
    // the Settings toggle (cron.update_job → enabled=true).
    pause_job(config, &job.id)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openhuman::cron::{
        add_agent_job_with_definition, list_jobs, Schedule, SessionTarget,
    };
    use chrono::{Duration as ChronoDuration, Utc};
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

    #[test]
    fn constants_are_valid_identifiers() {
        assert!(!MORNING_BRIEFING_JOB_NAME.is_empty());
        assert!(!LEGACY_WELCOME_JOB_NAME.is_empty());
        assert_ne!(MORNING_BRIEFING_JOB_NAME, LEGACY_WELCOME_JOB_NAME);
    }

    #[test]
    fn proactive_delivery_has_no_channel() {
        let d = proactive_delivery();
        assert_eq!(d.mode, "proactive");
        assert!(d.channel.is_none());
        assert!(d.to.is_none());
        assert!(d.best_effort);
    }

    #[test]
    fn seeds_bounty_worker_disabled_and_idempotent() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        seed_proactive_agents(&config).expect("first seed");
        let jobs = list_jobs(&config).unwrap();
        let worker: Vec<_> = jobs
            .iter()
            .filter(|j| j.name.as_deref() == Some(BOUNTY_WORKER_JOB_NAME))
            .collect();
        assert_eq!(
            worker.len(),
            1,
            "exactly one bounty_worker job, got {worker:?}"
        );
        let worker = worker[0];
        // Opt-in: must be created disabled.
        assert!(
            !worker.enabled,
            "bounty_worker must be seeded disabled (opt-in)"
        );
        // Routed at the dedicated earn-only agent definition.
        assert_eq!(worker.agent_id.as_deref(), Some(BOUNTY_WORKER_JOB_NAME));

        // Idempotent: a second seed must not create a duplicate.
        seed_proactive_agents(&config).expect("second seed");
        let after = list_jobs(&config).unwrap();
        assert_eq!(
            after
                .iter()
                .filter(|j| j.name.as_deref() == Some(BOUNTY_WORKER_JOB_NAME))
                .count(),
            1,
            "second seed must not duplicate the bounty_worker job"
        );
    }

    #[test]
    fn seed_prunes_legacy_welcome_job() {
        // Simulate the state an earlier build would have left behind:
        // a one-shot cron job named "welcome" that never fired
        // (scheduler off, process killed before the 10-second
        // window, etc.). seed_proactive_agents should delete it so
        // the new immediate-fire welcome path doesn't double-deliver.
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let fire_at = Utc::now() + ChronoDuration::hours(1);
        add_agent_job_with_definition(
            &config,
            Some(LEGACY_WELCOME_JOB_NAME.to_string()),
            Schedule::At { at: fire_at },
            "legacy welcome prompt",
            SessionTarget::Isolated,
            None,
            Some(proactive_delivery()),
            true,
            Some(LEGACY_WELCOME_JOB_NAME.to_string()),
        )
        .expect("seed legacy welcome");
        assert_eq!(list_jobs(&config).unwrap().len(), 1);

        seed_proactive_agents(&config).expect("seed should succeed");

        let remaining = list_jobs(&config).unwrap();
        assert!(
            !remaining
                .iter()
                .any(|j| j.name.as_deref() == Some(LEGACY_WELCOME_JOB_NAME)),
            "legacy welcome job should have been pruned, got: {remaining:?}"
        );
        // Morning briefing should have been seeded in its place.
        assert!(
            remaining
                .iter()
                .any(|j| j.name.as_deref() == Some(MORNING_BRIEFING_JOB_NAME)),
            "morning_briefing should have been seeded, got: {remaining:?}"
        );
    }
}
