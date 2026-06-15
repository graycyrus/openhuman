//! Controller schemas and registered-controller list for the tinyplace namespace.
//!
//! These controllers are registered in the **internal** registry (callable via
//! `core_rpc_relay` by the renderer, but NOT advertised to agents via tool
//! listings or schema discovery).
//!
//! RPC method names follow the standard pattern:
//!   `openhuman.tinyplace_<function>`
//! e.g. `openhuman.tinyplace_directory_list_agents`.

use crate::core::all::RegisteredController;
use crate::core::{ControllerSchema, FieldSchema, TypeSchema};

use crate::openhuman::tinyplace::manifest::{
    handle_tinyplace_directory_get_agent, handle_tinyplace_directory_list_agents,
    handle_tinyplace_explorer_overview, handle_tinyplace_profiles_activity,
    handle_tinyplace_profiles_agent_card, handle_tinyplace_profiles_attestations,
    handle_tinyplace_profiles_broadcasts, handle_tinyplace_profiles_get,
    handle_tinyplace_profiles_groups, handle_tinyplace_search_unified, handle_tinyplace_users_get,
    handle_tinyplace_users_update_profile,
};

// ── Schema helpers ────────────────────────────────────────────────────────────

fn optional_object(name: &'static str, comment: &'static str) -> FieldSchema {
    FieldSchema {
        name,
        ty: TypeSchema::Option(Box::new(TypeSchema::Json)),
        comment,
        required: false,
    }
}

fn required_string(name: &'static str, comment: &'static str) -> FieldSchema {
    FieldSchema {
        name,
        ty: TypeSchema::String,
        comment,
        required: true,
    }
}

fn json_output(name: &'static str, comment: &'static str) -> FieldSchema {
    FieldSchema {
        name,
        ty: TypeSchema::Json,
        comment,
        required: true,
    }
}

// ── Schema definitions ────────────────────────────────────────────────────────

fn schema_directory_list_agents() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_list_agents",
        description:
            "List agents in the tiny.place directory, optionally filtered by query params.",
        inputs: vec![optional_object(
            "params",
            "Optional AgentQueryParams (limit, cursor, q, skill, tag, etc.).",
        )],
        outputs: vec![json_output(
            "result",
            "ListAgentsResponse containing a list of AgentCard objects.",
        )],
    }
}

fn schema_directory_get_agent() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_get_agent",
        description: "Fetch a single agent's card from the tiny.place directory by agent ID.",
        inputs: vec![required_string(
            "agentId",
            "The agent's base58 Solana address / tiny.place identity.",
        )],
        outputs: vec![json_output("result", "AgentCard for the requested agent.")],
    }
}

fn schema_explorer_overview() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "explorer_overview",
        description:
            "Return the public tiny.place explorer overview (network stats, recent transactions).",
        inputs: vec![],
        outputs: vec![json_output(
            "result",
            "ExplorerOverview with network-wide summary data.",
        )],
    }
}

fn schema_search_unified() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "search_unified",
        description:
            "Run a unified search across agents, groups, channels, and broadcasts on tiny.place.",
        inputs: vec![required_string("query", "Free-text search query.")],
        outputs: vec![json_output("result", "SearchResponse with ranked matches.")],
    }
}

// ── Profiles schemas ──────────────────────────────────────────────────────────

fn schema_profiles_get() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "profiles_get",
        description: "Fetch the public agent profile for a given tiny.place username.",
        inputs: vec![required_string(
            "username",
            "The tiny.place @handle / username to look up.",
        )],
        outputs: vec![json_output(
            "result",
            "AgentProfile for the requested user.",
        )],
    }
}

fn schema_profiles_activity() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "profiles_activity",
        description: "Fetch recent on-chain activity for a given tiny.place username.",
        inputs: vec![required_string(
            "username",
            "The tiny.place @handle to look up.",
        )],
        outputs: vec![json_output(
            "result",
            "ProfileActivity containing recent transactions and events.",
        )],
    }
}

fn schema_profiles_groups() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "profiles_groups",
        description: "List groups a given tiny.place username is a member of.",
        inputs: vec![required_string(
            "username",
            "The tiny.place @handle to look up.",
        )],
        outputs: vec![json_output(
            "result",
            "ProfileGroupsResponse containing an array of ProfileGroupMembership.",
        )],
    }
}

fn schema_profiles_broadcasts() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "profiles_broadcasts",
        description: "Fetch broadcasts published by a given tiny.place username.",
        inputs: vec![required_string(
            "username",
            "The tiny.place @handle to look up.",
        )],
        outputs: vec![json_output(
            "result",
            "ProfileBroadcastsResponse containing an array of ProfileBroadcast.",
        )],
    }
}

fn schema_profiles_attestations() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "profiles_attestations",
        description: "Fetch trust attestations for a given tiny.place username.",
        inputs: vec![required_string(
            "username",
            "The tiny.place @handle to look up.",
        )],
        outputs: vec![json_output(
            "result",
            "ProfileAttestationsResponse containing an array of ProfileAttestation.",
        )],
    }
}

fn schema_profiles_agent_card() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "profiles_agent_card",
        description: "Fetch the machine-readable AgentCard for a given tiny.place username.",
        inputs: vec![required_string(
            "username",
            "The tiny.place @handle to look up.",
        )],
        outputs: vec![json_output("result", "AgentCard for the requested user.")],
    }
}

// ── Users schemas ─────────────────────────────────────────────────────────────

fn schema_users_get() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "users_get",
        description: "Fetch a wallet's User profile by its cryptoId.",
        inputs: vec![required_string(
            "cryptoId",
            "The wallet's base58 Solana address / cryptoId.",
        )],
        outputs: vec![json_output(
            "result",
            "User profile for the given cryptoId.",
        )],
    }
}

fn schema_users_update_profile() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "users_update_profile",
        description:
            "Update the signed-in wallet's User profile (display name, bio, avatar, links, tags).",
        inputs: vec![
            required_string("cryptoId", "The wallet's base58 Solana address / cryptoId."),
            FieldSchema {
                name: "update",
                ty: TypeSchema::Json,
                comment:
                    "UserProfileUpdate object (displayName, bio, avatar, links, tags, actorType).",
                required: true,
            },
        ],
        outputs: vec![json_output(
            "result",
            "Updated User profile after the write.",
        )],
    }
}

// ── Public exports ────────────────────────────────────────────────────────────

/// All tinyplace controller schemas (for schema discovery / validation).
pub fn all_tinyplace_controller_schemas() -> Vec<ControllerSchema> {
    vec![
        schema_directory_list_agents(),
        schema_directory_get_agent(),
        schema_explorer_overview(),
        schema_search_unified(),
        // Profiles section
        schema_profiles_get(),
        schema_profiles_activity(),
        schema_profiles_groups(),
        schema_profiles_broadcasts(),
        schema_profiles_attestations(),
        schema_profiles_agent_card(),
        // Users section
        schema_users_get(),
        schema_users_update_profile(),
    ]
}

/// All tinyplace registered controllers (wired into the **internal** registry).
pub fn all_tinyplace_registered_controllers() -> Vec<RegisteredController> {
    vec![
        RegisteredController {
            schema: schema_directory_list_agents(),
            handler: handle_tinyplace_directory_list_agents,
        },
        RegisteredController {
            schema: schema_directory_get_agent(),
            handler: handle_tinyplace_directory_get_agent,
        },
        RegisteredController {
            schema: schema_explorer_overview(),
            handler: handle_tinyplace_explorer_overview,
        },
        RegisteredController {
            schema: schema_search_unified(),
            handler: handle_tinyplace_search_unified,
        },
        // Profiles section
        RegisteredController {
            schema: schema_profiles_get(),
            handler: handle_tinyplace_profiles_get,
        },
        RegisteredController {
            schema: schema_profiles_activity(),
            handler: handle_tinyplace_profiles_activity,
        },
        RegisteredController {
            schema: schema_profiles_groups(),
            handler: handle_tinyplace_profiles_groups,
        },
        RegisteredController {
            schema: schema_profiles_broadcasts(),
            handler: handle_tinyplace_profiles_broadcasts,
        },
        RegisteredController {
            schema: schema_profiles_attestations(),
            handler: handle_tinyplace_profiles_attestations,
        },
        RegisteredController {
            schema: schema_profiles_agent_card(),
            handler: handle_tinyplace_profiles_agent_card,
        },
        // Users section
        RegisteredController {
            schema: schema_users_get(),
            handler: handle_tinyplace_users_get,
        },
        RegisteredController {
            schema: schema_users_update_profile(),
            handler: handle_tinyplace_users_update_profile,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_and_controller_lists_match() {
        assert_eq!(
            all_tinyplace_controller_schemas().len(),
            all_tinyplace_registered_controllers().len(),
            "schema list and registered list must be the same length"
        );
    }

    #[test]
    fn schema_namespace_is_tinyplace() {
        for schema in all_tinyplace_controller_schemas() {
            assert_eq!(schema.namespace, "tinyplace");
        }
    }

    #[test]
    fn rpc_method_names_have_correct_prefix() {
        use crate::core::all::rpc_method_name;
        for controller in all_tinyplace_registered_controllers() {
            let method = rpc_method_name(&controller.schema);
            assert!(
                method.starts_with("openhuman.tinyplace_"),
                "method {method} does not start with openhuman.tinyplace_"
            );
        }
    }
}
