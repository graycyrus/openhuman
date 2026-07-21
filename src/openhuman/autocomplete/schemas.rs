use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use crate::core::all::{ControllerFuture, RegisteredController};
use crate::core::{ControllerSchema, FieldSchema, TypeSchema};
use crate::openhuman::autocomplete::{AutocompleteAcceptParams, AutocompleteCurrentParams};
use crate::rpc::RpcOutcome;

pub fn all_controller_schemas() -> Vec<ControllerSchema> {
    vec![schemas("current"), schemas("accept")]
}

pub fn all_registered_controllers() -> Vec<RegisteredController> {
    vec![
        RegisteredController {
            schema: schemas("current"),
            handler: handle_current,
        },
        RegisteredController {
            schema: schemas("accept"),
            handler: handle_accept,
        },
    ]
}

pub fn schemas(function: &str) -> ControllerSchema {
    match function {
        "current" => ControllerSchema {
            namespace: "autocomplete",
            function: "current",
            description: "Compute current in-app suggestion for the provided composer context.",
            inputs: vec![FieldSchema {
                name: "context",
                ty: TypeSchema::Option(Box::new(TypeSchema::String)),
                comment: "Explicit context (composer draft text) to score suggestions against.",
                required: false,
            }],
            outputs: vec![FieldSchema {
                name: "result",
                ty: TypeSchema::Ref("AutocompleteCurrentResult"),
                comment: "Current suggestion payload.",
                required: true,
            }],
        },
        "accept" => ControllerSchema {
            namespace: "autocomplete",
            function: "accept",
            description: "Accept the current or provided in-app autocomplete suggestion.",
            inputs: vec![
                FieldSchema {
                    name: "suggestion",
                    ty: TypeSchema::Option(Box::new(TypeSchema::String)),
                    comment: "Optional explicit suggestion value to apply.",
                    required: false,
                },
                FieldSchema {
                    name: "skip_apply",
                    ty: TypeSchema::Option(Box::new(TypeSchema::Bool)),
                    comment: "When true, mark suggestion accepted without accessibility insertion.",
                    required: false,
                },
            ],
            outputs: vec![FieldSchema {
                name: "result",
                ty: TypeSchema::Ref("AutocompleteAcceptResult"),
                comment: "Suggestion acceptance result.",
                required: true,
            }],
        },
        _ => ControllerSchema {
            namespace: "autocomplete",
            function: "unknown",
            description: "Unknown autocomplete controller function.",
            inputs: vec![],
            outputs: vec![FieldSchema {
                name: "error",
                ty: TypeSchema::String,
                comment: "Lookup error details.",
                required: true,
            }],
        },
    }
}

fn handle_current(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let payload = if params.is_empty() {
            None
        } else {
            Some(deserialize_params::<AutocompleteCurrentParams>(params)?)
        };
        to_json(crate::openhuman::autocomplete::rpc::autocomplete_current(payload).await?)
    })
}

fn handle_accept(params: Map<String, Value>) -> ControllerFuture {
    Box::pin(async move {
        let payload = deserialize_params::<AutocompleteAcceptParams>(params)?;
        to_json(crate::openhuman::autocomplete::rpc::autocomplete_accept(payload).await?)
    })
}

fn deserialize_params<T: DeserializeOwned>(params: Map<String, Value>) -> Result<T, String> {
    serde_json::from_value(Value::Object(params)).map_err(|e| format!("invalid params: {e}"))
}

fn to_json<T: serde::Serialize>(outcome: RpcOutcome<T>) -> Result<Value, String> {
    outcome.into_cli_compatible_json()
}
