//! RPC/CLI controller surface for the `browser_companion::` domain. Mirrors
//! `src/openhuman/flows/schemas.rs`'s shape exactly: `schemas(function)`
//! builds one `ControllerSchema`, `all_controller_schemas()`/
//! `all_registered_controllers()` aggregate them, and each `handle_*` loads
//! config, reads params, awaits the matching `ops::*` fn, and converts the
//! result into CLI-compatible JSON via `RpcOutcome`.
//!
//! Namespace is `browser_companion`, so methods become
//! `openhuman.browser_companion_<name>` over `/rpc`.
//!
//! **Secret discipline**: [`BrowserCompanionStatus`] never carries the
//! pairing secret — only `pair` / `rotate_secret` (via [`PairingInfo`])
//! expose it, and it is never written into a handler's log line or `logs`
//! entry.

use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use crate::core::all::{ControllerFuture, RegisteredController};
use crate::core::{ControllerSchema, FieldSchema, TypeSchema};
use crate::openhuman::browser_companion::ops::{self, BrowserCompanionSettingsPatch};
use crate::openhuman::browser_companion::LOG_PREFIX;
use crate::openhuman::config::rpc as config_rpc;
use crate::rpc::RpcOutcome;

fn shared_tab_fields() -> Vec<FieldSchema> {
    vec![
        FieldSchema {
            name: "id",
            ty: TypeSchema::U64,
            comment: "Chrome tab id.",
            required: true,
        },
        FieldSchema {
            name: "window_id",
            ty: TypeSchema::U64,
            comment: "Chrome window id containing the tab.",
            required: true,
        },
        FieldSchema {
            name: "url",
            ty: TypeSchema::String,
            comment: "Tab's current URL.",
            required: true,
        },
        FieldSchema {
            name: "title",
            ty: TypeSchema::String,
            comment: "Tab's current title.",
            required: true,
        },
    ]
}

/// Field schema for `BrowserCompanionStatus`, mirroring
/// `browser_companion::types::BrowserCompanionStatus` exactly. Deliberately
/// has no secret-bearing field — see the module doc.
fn status_fields() -> Vec<FieldSchema> {
    vec![
        FieldSchema {
            name: "running",
            ty: TypeSchema::Bool,
            comment: "Whether the loopback companion relay is currently running.",
            required: true,
        },
        FieldSchema {
            name: "extension_connected",
            ty: TypeSchema::Bool,
            comment: "Whether a paired extension currently holds an authenticated relay \
                      session. Always false when `running` is false.",
            required: true,
        },
        FieldSchema {
            name: "paired_extension_id",
            ty: TypeSchema::Option(Box::new(TypeSchema::String)),
            comment: "The extension id the relay is configured to accept, if any.",
            required: false,
        },
        FieldSchema {
            name: "relay_url",
            ty: TypeSchema::Option(Box::new(TypeSchema::String)),
            comment: "The `ws://127.0.0.1:<port>/v1/extension` URL the extension connects to, \
                      present only while the relay is running.",
            required: false,
        },
        FieldSchema {
            name: "shared_tabs",
            ty: TypeSchema::Array(Box::new(TypeSchema::Object {
                fields: shared_tab_fields(),
            })),
            comment: "Tabs the paired extension has explicitly shared with the companion. \
                      Empty when not running or nothing is shared.",
            required: true,
        },
    ]
}

fn status_output() -> FieldSchema {
    FieldSchema {
        name: "status",
        ty: TypeSchema::Object {
            fields: status_fields(),
        },
        comment: "Current lifecycle + pairing snapshot. NEVER includes the pairing secret.",
        required: true,
    }
}

/// Field schema for `PairingInfo`, mirroring
/// `browser_companion::types::PairingInfo` exactly.
fn pairing_fields() -> Vec<FieldSchema> {
    vec![
        FieldSchema {
            name: "relay_url",
            ty: TypeSchema::String,
            comment: "The `ws://127.0.0.1:<port>/v1/extension` URL to connect to.",
            required: true,
        },
        FieldSchema {
            name: "pairing_secret",
            ty: TypeSchema::String,
            comment: "The freshly (re)generated pairing secret, exposed exactly once here. \
                      Treat as sensitive — it authenticates the WebSocket upgrade and is never \
                      returned from `status`.",
            required: true,
        },
    ]
}

fn pairing_output() -> FieldSchema {
    FieldSchema {
        name: "pairing",
        ty: TypeSchema::Object {
            fields: pairing_fields(),
        },
        comment: "Pairing material for the extension to complete the WebSocket handshake.",
        required: true,
    }
}

pub fn all_controller_schemas() -> Vec<ControllerSchema> {
    vec![
        schemas("status"),
        schemas("enable"),
        schemas("disable"),
        schemas("pair"),
        schemas("unpair"),
        schemas("rotate_secret"),
    ]
}

pub fn all_registered_controllers() -> Vec<RegisteredController> {
    vec![
        RegisteredController {
            schema: schemas("status"),
            handler: handle_status,
        },
        RegisteredController {
            schema: schemas("enable"),
            handler: handle_enable,
        },
        RegisteredController {
            schema: schemas("disable"),
            handler: handle_disable,
        },
        RegisteredController {
            schema: schemas("pair"),
            handler: handle_pair,
        },
        RegisteredController {
            schema: schemas("unpair"),
            handler: handle_unpair,
        },
        RegisteredController {
            schema: schemas("rotate_secret"),
            handler: handle_rotate_secret,
        },
    ]
}

pub fn schemas(function: &str) -> ControllerSchema {
    match function {
        "status" => ControllerSchema {
            namespace: "browser_companion",
            function: "status",
            description: "Current lifecycle + pairing snapshot of the Browser Companion relay \
                          (never includes the pairing secret).",
            inputs: vec![],
            outputs: vec![status_output()],
        },
        "enable" => ControllerSchema {
            namespace: "browser_companion",
            function: "enable",
            description: "Enable the Browser Companion relay: persists `enabled=true` (and \
                          `port`, if given) to config, then starts the loopback \
                          CompanionServer.",
            inputs: vec![FieldSchema {
                name: "port",
                ty: TypeSchema::Option(Box::new(TypeSchema::U64)),
                comment: "Loopback TCP port to bind the relay to; omit to keep the currently \
                          configured port.",
                required: false,
            }],
            outputs: vec![status_output()],
        },
        "disable" => ControllerSchema {
            namespace: "browser_companion",
            function: "disable",
            description: "Disable the Browser Companion relay: persists `enabled=false` to \
                          config and stops the loopback CompanionServer.",
            inputs: vec![],
            outputs: vec![status_output()],
        },
        "pair" => ControllerSchema {
            namespace: "browser_companion",
            function: "pair",
            description: "Pair a Chrome extension id: persists it to config, restarts the \
                          relay bound to it, and returns fresh pairing material (relay URL + \
                          secret).",
            inputs: vec![FieldSchema {
                name: "extension_id",
                ty: TypeSchema::String,
                comment: "Exact Chrome extension id to pair (32 lowercase a-p characters).",
                required: true,
            }],
            outputs: vec![pairing_output()],
        },
        "unpair" => ControllerSchema {
            namespace: "browser_companion",
            function: "unpair",
            description: "Clear the pairing: persists an empty `extension_id` to config, \
                          rotates the pairing secret (invalidating the old one), and stops the \
                          relay.",
            inputs: vec![],
            outputs: vec![status_output()],
        },
        "rotate_secret" => ControllerSchema {
            namespace: "browser_companion",
            function: "rotate_secret",
            description: "Rotate the pairing secret (invalidating the old one) and, if the \
                          relay is running, restart it so the new secret takes effect.",
            inputs: vec![],
            outputs: vec![pairing_output()],
        },
        _other => ControllerSchema {
            namespace: "browser_companion",
            function: "unknown",
            description: "Unknown browser_companion controller function.",
            inputs: vec![FieldSchema {
                name: "function",
                ty: TypeSchema::String,
                comment: "Unknown function requested for schema lookup.",
                required: true,
            }],
            outputs: vec![FieldSchema {
                name: "error",
                ty: TypeSchema::String,
                comment: "Lookup error details.",
                required: true,
            }],
        },
    }
}

fn handle_status(_params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let config = config_rpc::load_config_with_timeout().await?;
        log::debug!("{LOG_PREFIX} handle_status: entry");
        let status = ops::companion_status(&config);
        to_json(RpcOutcome::single_log(
            status,
            "browser_companion status read",
        ))
    })
}

fn handle_enable(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let mut config = config_rpc::load_config_with_timeout().await?;
        let port = params
            .get("port")
            .filter(|v| !v.is_null())
            .and_then(Value::as_u64)
            .map(|p| u16::try_from(p).map_err(|_| format!("invalid 'port': {p} out of u16 range")))
            .transpose()?;
        log::info!(
            "{LOG_PREFIX} handle_enable: entry port_override={}",
            port.is_some()
        );

        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                enabled: Some(true),
                port,
                extension_id: None,
            },
        )
        .await
        .map_err(|e| e.to_string())?;

        ops::start_companion_server(&config)
            .await
            .map_err(|e| e.to_string())?;

        let status = ops::companion_status(&config);
        to_json(RpcOutcome::single_log(status, "browser_companion enabled"))
    })
}

fn handle_disable(_params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let mut config = config_rpc::load_config_with_timeout().await?;
        log::info!("{LOG_PREFIX} handle_disable: entry");

        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                enabled: Some(false),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

        ops::stop_companion_server().await;

        let status = ops::companion_status(&config);
        to_json(RpcOutcome::single_log(status, "browser_companion disabled"))
    })
}

fn handle_pair(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let mut config = config_rpc::load_config_with_timeout().await?;
        let extension_id = read_required::<String>(&params, "extension_id")?;
        log::info!(
            "{LOG_PREFIX} handle_pair: entry extension_id_len={}",
            extension_id.len()
        );

        // Persist BEFORE restarting the relay so the paired id survives a
        // restart even if the relay restart itself fails.
        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                extension_id: Some(extension_id.clone()),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

        let pairing = ops::pair(&config, extension_id)
            .await
            .map_err(|e| e.to_string())?;
        to_json(RpcOutcome::single_log(pairing, "browser_companion paired"))
    })
}

fn handle_unpair(_params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let mut config = config_rpc::load_config_with_timeout().await?;
        log::info!("{LOG_PREFIX} handle_unpair: entry");

        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                extension_id: Some(String::new()),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

        ops::unpair(&config).await.map_err(|e| e.to_string())?;

        let status = ops::companion_status(&config);
        to_json(RpcOutcome::single_log(status, "browser_companion unpaired"))
    })
}

fn handle_rotate_secret(_params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let config = config_rpc::load_config_with_timeout().await?;
        log::info!("{LOG_PREFIX} handle_rotate_secret: entry");

        let pairing = ops::rotate_secret(&config)
            .await
            .map_err(|e| e.to_string())?;
        to_json(RpcOutcome::single_log(
            pairing,
            "browser_companion pairing secret rotated",
        ))
    })
}

fn read_required<T: DeserializeOwned>(params: &Map<String, Value>, key: &str) -> Result<T, String> {
    let value = params
        .get(key)
        .cloned()
        .ok_or_else(|| format!("missing required param '{key}'"))?;
    serde_json::from_value(value).map_err(|e| format!("invalid '{key}': {e}"))
}

fn to_json<T: serde::Serialize>(outcome: RpcOutcome<T>) -> Result<Value, String> {
    outcome.into_cli_compatible_json()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openhuman::config::Config;

    fn test_config(tmp: &std::path::Path) -> Config {
        Config {
            workspace_dir: tmp.join("workspace"),
            config_path: tmp.join("config.toml"),
            ..Config::default()
        }
    }

    #[test]
    fn all_controller_schemas_covers_every_supported_function() {
        let names: Vec<_> = all_controller_schemas()
            .into_iter()
            .map(|s| s.function)
            .collect();
        assert_eq!(
            names,
            vec![
                "status",
                "enable",
                "disable",
                "pair",
                "unpair",
                "rotate_secret"
            ]
        );
    }

    #[test]
    fn all_registered_controllers_matches_schema_count_and_namespace() {
        let registered = all_registered_controllers();
        assert_eq!(registered.len(), all_controller_schemas().len());
        for controller in &registered {
            assert_eq!(controller.schema.namespace, "browser_companion");
        }
    }

    #[test]
    fn unknown_function_schema_is_a_documented_fallback() {
        let schema = schemas("does_not_exist");
        assert_eq!(schema.function, "unknown");
        assert_eq!(schema.namespace, "browser_companion");
    }

    #[test]
    fn status_output_never_declares_a_secret_field() {
        // Regression guard for the "never return the pairing secret in
        // status" contract: assert no output field schema anywhere under
        // `status` is named like a secret.
        let schema = schemas("status");
        fn walk(fields: &[FieldSchema]) {
            for field in fields {
                assert_ne!(
                    field.name, "pairing_secret",
                    "status must not expose a secret field"
                );
                if let TypeSchema::Object { fields } = &field.ty {
                    walk(fields);
                }
            }
        }
        walk(&schema.outputs);
    }

    #[tokio::test]
    async fn handle_status_reports_idle_snapshot_for_a_fresh_config() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let config = test_config(tmp.path());
        // No RPC round trip here (that needs the ambient config-load seam);
        // exercise the same call `handle_status` makes directly.
        let status = ops::companion_status(&config);
        let value = serde_json::to_value(&status).expect("status should serialize");
        assert_eq!(value["running"], serde_json::json!(false));
        assert!(value.get("pairing_secret").is_none());
    }

    #[tokio::test]
    async fn pair_then_unpair_round_trip_persists_and_clears_extension_id() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mut config = test_config(tmp.path());

        // Mirrors `handle_pair`'s persist-then-act sequence directly against
        // `ops`, without going through the ambient config-load RPC seam.
        let extension_id = "abcdefghijklmnopabcdefghijklmnop".to_string();
        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                extension_id: Some(extension_id.clone()),
                ..Default::default()
            },
        )
        .await
        .expect("persist_settings should succeed");

        let on_disk = tokio::fs::read_to_string(&config.config_path)
            .await
            .expect("config should be written");
        assert!(on_disk.contains(&extension_id));

        // Mirrors `handle_unpair`'s persist-then-act sequence.
        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                extension_id: Some(String::new()),
                ..Default::default()
            },
        )
        .await
        .expect("persist_settings should succeed");

        assert!(config.browser_companion.extension_id.is_empty());
        let on_disk = tokio::fs::read_to_string(&config.config_path)
            .await
            .expect("config should be written");
        assert!(!on_disk.contains(&extension_id));
    }

    #[tokio::test]
    async fn enable_then_disable_round_trip_persists_flag() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mut config = test_config(tmp.path());
        assert!(!config.browser_companion.enabled);

        // Mirrors `handle_enable`'s persist step (skips actually starting the
        // relay, which `start_then_status_running_then_stop` in `ops.rs`
        // already covers with a live port-0 bind).
        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                enabled: Some(true),
                port: Some(45001),
                extension_id: None,
            },
        )
        .await
        .expect("persist_settings should succeed");
        assert!(config.browser_companion.enabled);
        assert_eq!(config.browser_companion.port, 45001);

        // Mirrors `handle_disable`'s persist step.
        ops::persist_settings(
            &mut config,
            BrowserCompanionSettingsPatch {
                enabled: Some(false),
                ..Default::default()
            },
        )
        .await
        .expect("persist_settings should succeed");
        assert!(!config.browser_companion.enabled);

        let on_disk = tokio::fs::read_to_string(&config.config_path)
            .await
            .expect("config should be written");
        assert!(on_disk.contains("enabled = false"));
    }
}
