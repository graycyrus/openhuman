//! Business logic for the Browser Companion domain: owns the lifecycle of the
//! TinyFlows `CompanionServer` (loopback WebSocket relay to the Chrome
//! extension) and its pairing secret.
//!
//! Increment 1 scope: lifecycle + pairing only. No RPC controllers and no
//! flows wiring yet — those land in later stages. See
//! `src/openhuman/browser_companion/mod.rs` for the module overview.

use std::sync::{Arc, Mutex, OnceLock};

use tinyflows::browser::BrowserRelay;
use tinyflows::companion::{CompanionServer, CompanionServerConfig, RelayPolicy};

use crate::openhuman::browser_companion::store::resolve_secret_store;
use crate::openhuman::browser_companion::types::{BrowserCompanionStatus, PairingInfo};
use crate::openhuman::browser_companion::LOG_PREFIX;
use crate::openhuman::config::Config;
use crate::openhuman::tinyflows::build_capabilities;

/// Namespace passed to [`build_capabilities`] for every non-browser effect
/// (state store, http, code, agent) the companion server's native workflow
/// runs might use in a later increment.
const CAPS_STATE_NAMESPACE: &str = "browser-companion";

/// In-memory lifecycle state for the companion relay: at most one instance
/// runs per process.
struct CompanionRuntime {
    server: Option<CompanionServer>,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl CompanionRuntime {
    const fn empty() -> Self {
        Self {
            server: None,
            task: None,
        }
    }
}

static RUNTIME: OnceLock<Mutex<CompanionRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<CompanionRuntime> {
    RUNTIME.get_or_init(|| Mutex::new(CompanionRuntime::empty()))
}

fn workflows_dir(config: &Config) -> std::path::PathBuf {
    config
        .workspace_dir
        .join("browser_companion")
        .join("workflows")
}

fn relay_url(port: u16) -> String {
    format!("ws://127.0.0.1:{port}/v1/extension")
}

/// Starts the companion relay if `config.browser_companion.enabled` and no
/// instance is already running. No-op (with a log line) otherwise.
pub async fn start_companion_server(config: &Config) -> anyhow::Result<()> {
    log::debug!("{LOG_PREFIX} start_companion_server: entry");

    if !config.browser_companion.enabled {
        log::debug!("{LOG_PREFIX} start_companion_server: disabled via config; skipping");
        return Ok(());
    }

    start_with_extension_id(config, config.browser_companion.extension_id.clone()).await
}

/// Core start path shared by [`start_companion_server`] (uses the persisted
/// `extension_id`) and [`pair`] (uses the freshly supplied one). Does **not**
/// re-check `config.browser_companion.enabled` — callers that want the
/// enabled-gate must go through [`start_companion_server`].
async fn start_with_extension_id(config: &Config, extension_id: String) -> anyhow::Result<()> {
    {
        let guard = runtime()
            .lock()
            .expect("browser_companion runtime poisoned");
        if guard.server.is_some() {
            log::debug!("{LOG_PREFIX} start_with_extension_id: already running; no-op");
            return Ok(());
        }
    }

    let port = config.browser_companion.port;
    log::info!(
        "{LOG_PREFIX} start_with_extension_id: starting relay port={port} extension_id_set={}",
        !extension_id.is_empty()
    );

    let policy = RelayPolicy::loopback(port);
    let workflows_dir = workflows_dir(config);
    std::fs::create_dir_all(&workflows_dir).map_err(|error| {
        log::warn!(
            "{LOG_PREFIX} start_companion_server: failed to create workflows dir {}: {error}",
            workflows_dir.display()
        );
        anyhow::anyhow!("failed to create browser_companion workflows dir: {error}")
    })?;

    let secret_store = resolve_secret_store(config)?;
    let pairing_secret = secret_store.load_or_create().map_err(|error| {
        log::warn!("{LOG_PREFIX} start_companion_server: secret load_or_create failed: {error}");
        anyhow::anyhow!("failed to load or create pairing secret: {error}")
    })?;

    let capabilities = build_capabilities(Arc::new(config.clone()), CAPS_STATE_NAMESPACE);

    let server_config = CompanionServerConfig {
        policy,
        extension_id,
        pairing_secret,
        workflows_dir,
        capabilities,
    };

    let server = CompanionServer::new(server_config).map_err(|error| {
        log::warn!("{LOG_PREFIX} start_companion_server: CompanionServer::new failed: {error}");
        anyhow::anyhow!("failed to construct companion server: {error}")
    })?;

    let bind_addr = server.bind_addr();
    let serving = server.clone();
    let task = tokio::spawn(async move {
        log::info!("{LOG_PREFIX} companion relay serving on {bind_addr}");
        if let Err(error) = serving.serve().await {
            log::error!("{LOG_PREFIX} companion relay listener exited with error: {error}");
        } else {
            log::info!("{LOG_PREFIX} companion relay stopped cleanly");
        }
    });

    let mut guard = runtime()
        .lock()
        .expect("browser_companion runtime poisoned");
    guard.server = Some(server);
    guard.task = Some(task);
    log::info!("{LOG_PREFIX} start_with_extension_id: relay started bind_addr={bind_addr}");
    Ok(())
}

/// Stops the companion relay if running. No-op (with a log line) otherwise.
pub async fn stop_companion_server() {
    log::debug!("{LOG_PREFIX} stop_companion_server: entry");
    let (server, task) = {
        let mut guard = runtime()
            .lock()
            .expect("browser_companion runtime poisoned");
        (guard.server.take(), guard.task.take())
    };

    if server.is_none() {
        log::debug!("{LOG_PREFIX} stop_companion_server: not running; no-op");
        return;
    }

    if let Some(task) = task {
        task.abort();
        log::info!("{LOG_PREFIX} stop_companion_server: relay task aborted");
    }
}

/// Returns a handle usable to route `slug:"browser"` tool calls to the
/// paired extension, for later flows wiring (Stage C3). `None` when the
/// relay is not running.
pub fn browser_relay() -> Option<Arc<dyn BrowserRelay>> {
    let guard = runtime()
        .lock()
        .expect("browser_companion runtime poisoned");
    guard.server.as_ref().map(CompanionServer::browser_relay)
}

/// Binds a workflow run to an explicitly-shared browser tab so that run's
/// `slug:"browser"` tool calls (routed through the handle from
/// [`browser_relay`]) are authorized against that tab. Mirrors
/// `tinyflows::companion::CompanionServer::bind_run`, keeping the server
/// handle itself encapsulated in this domain (Stage C3 — flows wiring).
///
/// Returns an error when the relay is not currently running, or when the
/// underlying `CompanionServer::bind_run` call rejects the binding (e.g. the
/// tab isn't one the extension has explicitly shared — `tab_not_shared`).
pub fn bind_run(run_id: &str, tab_id: u64) -> anyhow::Result<()> {
    log::debug!("{LOG_PREFIX} bind_run: entry run_id={run_id} tab_id={tab_id}");
    let guard = runtime()
        .lock()
        .expect("browser_companion runtime poisoned");
    let Some(server) = guard.server.as_ref() else {
        log::warn!("{LOG_PREFIX} bind_run: relay not running; cannot bind run_id={run_id}");
        return Err(anyhow::anyhow!(
            "browser companion relay is not running; cannot bind run '{run_id}' to tab {tab_id}"
        ));
    };
    server
        .bind_run(run_id.to_string(), tab_id)
        .map_err(|error| {
            log::warn!(
                "{LOG_PREFIX} bind_run: CompanionServer::bind_run failed run_id={run_id} \
             tab_id={tab_id}: {error}"
            );
            anyhow::anyhow!("failed to bind run '{run_id}' to browser tab {tab_id}: {error}")
        })?;
    log::info!("{LOG_PREFIX} bind_run: bound run_id={run_id} tab_id={tab_id}");
    Ok(())
}

/// Releases a run→tab binding after an external run settles. No-op (with a
/// debug log) if the relay isn't running or nothing was bound for `run_id` —
/// idempotent, mirroring `tinyflows::companion::CompanionServer::unbind_run`.
pub fn unbind_run(run_id: &str) {
    log::debug!("{LOG_PREFIX} unbind_run: entry run_id={run_id}");
    let guard = runtime()
        .lock()
        .expect("browser_companion runtime poisoned");
    let Some(server) = guard.server.as_ref() else {
        log::debug!("{LOG_PREFIX} unbind_run: relay not running; no-op");
        return;
    };
    server.unbind_run(run_id);
    log::debug!("{LOG_PREFIX} unbind_run: unbound run_id={run_id} (no-op if it wasn't bound)");
}

/// Whether a paired extension currently holds an authenticated relay
/// session. Always `false` when the relay is not running.
pub fn is_extension_connected() -> bool {
    let guard = runtime()
        .lock()
        .expect("browser_companion runtime poisoned");
    guard
        .server
        .as_ref()
        .map(CompanionServer::is_extension_connected)
        .unwrap_or(false)
}

/// Current lifecycle + pairing snapshot.
pub fn companion_status(config: &Config) -> BrowserCompanionStatus {
    let guard = runtime()
        .lock()
        .expect("browser_companion runtime poisoned");
    let running = guard.server.is_some();
    let extension_connected = guard
        .server
        .as_ref()
        .map(CompanionServer::is_extension_connected)
        .unwrap_or(false);
    let shared_tabs = guard
        .server
        .as_ref()
        .map(|server| server.shared_tabs().into_iter().map(Into::into).collect())
        .unwrap_or_default();

    let paired_extension_id = if config.browser_companion.extension_id.is_empty() {
        None
    } else {
        Some(config.browser_companion.extension_id.clone())
    };
    let relay_url = running.then(|| relay_url(config.browser_companion.port));

    log::debug!(
        "{LOG_PREFIX} companion_status: running={running} extension_connected={extension_connected} shared_tab_count={}",
        {
            let count: &Vec<_> = &shared_tabs;
            count.len()
        }
    );

    BrowserCompanionStatus {
        running,
        extension_connected,
        paired_extension_id,
        relay_url,
        shared_tabs,
    }
}

/// Pairs a new extension id: restarts the relay bound to `extension_id`
/// (rather than whatever is currently persisted in `config`) and returns the
/// relay URL + current pairing secret.
///
/// `config.browser_companion.extension_id` is **not** mutated here — the
/// caller of a future RPC handler is responsible for persisting the new
/// `extension_id` via `config.update_*` (see `TODO(stage-E)`). This
/// increment only needs the relay itself to come up bound to the new id, so
/// `extension_id` is threaded straight into [`start_with_extension_id`]
/// instead of round-tripping through a mutated config copy.
pub async fn pair(config: &Config, extension_id: String) -> anyhow::Result<PairingInfo> {
    log::info!(
        "{LOG_PREFIX} pair: entry extension_id_len={}",
        extension_id.len()
    );
    // TODO(stage-E): persist `browser_companion.extension_id` via a
    // `config.update_*` RPC once the RPC surface for this domain lands.

    stop_companion_server().await;
    start_with_extension_id(config, extension_id).await?;

    let secret_store = resolve_secret_store(config)?;
    let pairing_secret = secret_store.load_or_create().map_err(|error| {
        log::warn!("{LOG_PREFIX} pair: secret load_or_create failed: {error}");
        anyhow::anyhow!("failed to load pairing secret after pairing: {error}")
    })?;

    log::info!("{LOG_PREFIX} pair: relay restarted with new extension_id");
    Ok(PairingInfo {
        relay_url: relay_url(config.browser_companion.port),
        pairing_secret: pairing_secret.expose().to_string(),
    })
}

/// Clears the pairing (rotates the secret, invalidating the old one) and
/// stops the relay.
///
/// Same in-memory-only caveat as [`pair`] applies to persisting a cleared
/// `extension_id` — see `TODO(stage-E)`.
pub async fn unpair(config: &Config) -> anyhow::Result<()> {
    log::info!("{LOG_PREFIX} unpair: entry");
    // TODO(stage-E): persist the cleared `extension_id` via `config.update_*`.

    let secret_store = resolve_secret_store(config)?;
    secret_store.rotate().map_err(|error| {
        log::warn!("{LOG_PREFIX} unpair: secret rotate failed: {error}");
        anyhow::anyhow!("failed to rotate pairing secret during unpair: {error}")
    })?;

    stop_companion_server().await;
    log::info!("{LOG_PREFIX} unpair: relay stopped and secret rotated");
    Ok(())
}

/// Rotates the pairing secret and restarts the relay (if it was running) so
/// the new secret takes effect, returning it.
pub async fn rotate_secret(config: &Config) -> anyhow::Result<PairingInfo> {
    log::info!("{LOG_PREFIX} rotate_secret: entry");
    let secret_store = resolve_secret_store(config)?;
    let pairing_secret = secret_store.rotate().map_err(|error| {
        log::warn!("{LOG_PREFIX} rotate_secret: secret rotate failed: {error}");
        anyhow::anyhow!("failed to rotate pairing secret: {error}")
    })?;

    let was_running = {
        let guard = runtime()
            .lock()
            .expect("browser_companion runtime poisoned");
        guard.server.is_some()
    };
    if was_running {
        stop_companion_server().await;
        start_companion_server(config).await?;
        log::info!("{LOG_PREFIX} rotate_secret: relay restarted with rotated secret");
    }

    Ok(PairingInfo {
        relay_url: relay_url(config.browser_companion.port),
        pairing_secret: pairing_secret.expose().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config(workspace_dir: std::path::PathBuf) -> Config {
        Config {
            workspace_dir,
            ..Config::default()
        }
    }

    #[test]
    fn status_reports_no_paired_extension_for_default_config() {
        // Deliberately does not assert `status.running`: the lifecycle test
        // below shares the process-wide runtime static and may be running
        // concurrently. `paired_extension_id` is derived purely from
        // `config`, so it's deterministic regardless of runtime state.
        let tmp = tempfile::tempdir().expect("tempdir");
        let config = test_config(tmp.path().to_path_buf());
        let status = companion_status(&config);
        assert_eq!(status.paired_extension_id, None);
        assert!(!config.browser_companion.enabled);
    }

    #[test]
    fn companion_status_reports_paired_extension_id_from_config() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mut config = test_config(tmp.path().to_path_buf());
        config.browser_companion.extension_id = "abcdefghijklmnopabcdefghijklmnop".to_string();
        let status = companion_status(&config);
        assert_eq!(
            status.paired_extension_id,
            Some("abcdefghijklmnopabcdefghijklmnop".to_string())
        );
    }

    #[test]
    fn relay_url_formats_loopback_websocket_url() {
        assert_eq!(relay_url(32189), "ws://127.0.0.1:32189/v1/extension");
    }

    #[tokio::test]
    async fn start_is_noop_when_disabled_in_config() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let config = test_config(tmp.path().to_path_buf());
        assert!(!config.browser_companion.enabled);
        // Returns before touching the shared runtime static at all, so this
        // is safe to run alongside any other test in this file.
        let result = start_companion_server(&config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn browser_relay_and_is_extension_connected_never_panic() {
        // Read-only accessors must not panic regardless of whether some
        // other test in this file has a relay running concurrently — they
        // are not asserted against a specific state here.
        let _ = browser_relay();
        let _ = is_extension_connected();
    }

    #[test]
    fn bind_run_errs_when_relay_not_running() {
        // Deliberately does not touch the shared runtime static (no start/stop
        // call), so this is safe to run concurrently with any other test in
        // this file — `bind_run` only reads whether a server is present.
        //
        // NOTE: cannot assert `.is_err()` unconditionally here because this
        // process-wide static may already have a server running from another
        // concurrently-executing test in this file (e.g.
        // `start_then_status_running_then_stop`). Instead assert the
        // documented CONTRACT: when no server is running, `bind_run` errs
        // with a message naming the run id.
        if browser_relay().is_none() {
            let err = bind_run("test-run-not-running", 7)
                .expect_err("bind_run must error when the relay is not running");
            assert!(err.to_string().contains("test-run-not-running"), "{err}");
        }
    }

    #[test]
    fn unbind_run_is_a_noop_when_relay_not_running_or_run_unknown() {
        // Never panics regardless of runtime state; always a safe no-op for
        // an unknown/unbound run id.
        unbind_run("test-run-never-bound");
    }

    /// Full lifecycle: start (bound to an OS-assigned ephemeral port via
    /// port 0, so this can never collide with a real or another test's
    /// port) → status reports running → stop → status reports not running.
    ///
    /// This is the *only* test in this file that calls
    /// `start_companion_server`/`stop_companion_server` with `enabled: true`,
    /// so it cannot race against another test over the shared process-wide
    /// runtime static.
    #[tokio::test]
    async fn start_then_status_running_then_stop() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mut config = test_config(tmp.path().to_path_buf());
        config.browser_companion.enabled = true;
        // Port 0: let the OS assign a free ephemeral port. `CompanionServer::new`
        // only validates the policy and builds in-memory state — the actual
        // `TcpListener::bind` happens inside the spawned `serve()` task, so
        // this test's synchronous assertions don't depend on the bind
        // actually completing.
        config.browser_companion.port = 0;
        // Must be exactly 32 chars in a-p to pass `Authenticator::new`'s
        // Chrome-extension-id format check.
        config.browser_companion.extension_id = "abcdefghijklmnopabcdefghijklmnop".to_string();

        start_companion_server(&config)
            .await
            .expect("start_companion_server should succeed with a valid config");

        let status = companion_status(&config);
        assert!(status.running, "relay should report running after start");
        assert!(
            !status.extension_connected,
            "no extension has connected yet"
        );
        assert!(status.shared_tabs.is_empty());

        // bind_run/unbind_run while the relay is running (still the only test
        // in this file exercising the shared runtime static with a real
        // server up, so no race against another test's start/stop). No tab
        // has been shared by any extension in this test, so binding must fail
        // closed with a `tab_not_shared`-shaped error rather than silently
        // succeeding.
        let err = bind_run("test-run-1", 99).expect_err("no tab is shared in this test");
        assert!(err.to_string().contains("test-run-1"), "{err}");
        // Idempotent no-op even though nothing was ever actually bound.
        unbind_run("test-run-1");

        stop_companion_server().await;

        let status = companion_status(&config);
        assert!(!status.running, "relay should report stopped after stop");
    }
}
