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
    handle_tinyplace_directory_list_identities, handle_tinyplace_explorer_overview,
    handle_tinyplace_marketplace_identity_floor,
    handle_tinyplace_marketplace_identity_sale_history, handle_tinyplace_marketplace_list_bids,
    handle_tinyplace_marketplace_list_identities, handle_tinyplace_marketplace_list_offers,
    handle_tinyplace_marketplace_recent, handle_tinyplace_registry_get,
    handle_tinyplace_search_unified,
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

// ── Identities section schemas ────────────────────────────────────────────────

fn optional_integer(name: &'static str, comment: &'static str) -> FieldSchema {
    FieldSchema {
        name,
        ty: TypeSchema::Option(Box::new(TypeSchema::I64)),
        comment,
        required: false,
    }
}

fn optional_string(name: &'static str, comment: &'static str) -> FieldSchema {
    FieldSchema {
        name,
        ty: TypeSchema::Option(Box::new(TypeSchema::String)),
        comment,
        required: false,
    }
}

fn schema_directory_list_identities() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_list_identities",
        description: "List identity (@handle) listings from the tiny.place directory.",
        inputs: vec![optional_object(
            "params",
            "Optional IdentityListingQueryParams (limit, q, tag, seller, etc.).",
        )],
        outputs: vec![json_output(
            "result",
            "DirectoryIdentityListingsResponse containing identity listings.",
        )],
    }
}

fn schema_registry_get() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "registry_get",
        description:
            "Check the availability of a @handle and return its identity if it is registered.",
        inputs: vec![required_string(
            "name",
            "The handle to look up (with or without a leading @).",
        )],
        outputs: vec![json_output(
            "result",
            "AvailabilityResponse { available, name, identity? }.",
        )],
    }
}

fn schema_marketplace_list_identities() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_list_identities",
        description:
            "List identity (@handle) listings currently for sale on the tiny.place marketplace.",
        inputs: vec![
            optional_integer("limit", "Maximum number of results to return."),
            optional_string("status", "Filter by listing status, e.g. 'active'."),
        ],
        outputs: vec![json_output(
            "result",
            "IdentitiesResponse { identities: IdentityListing[] }.",
        )],
    }
}

fn schema_marketplace_identity_floor() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_identity_floor",
        description:
            "Fetch the floor price for identity names of a given character length on the marketplace.",
        inputs: vec![optional_integer(
            "length",
            "Character length to query the floor price for (e.g. 3 for 3-char handles).",
        )],
        outputs: vec![json_output(
            "result",
            "IdentityFloor { length, price: MarketplacePrice }.",
        )],
    }
}

fn schema_marketplace_recent() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_recent",
        description: "List the most recent completed identity sales on the tiny.place marketplace.",
        inputs: vec![],
        outputs: vec![json_output(
            "result",
            "RecentSalesResponse { sales: IdentitySale[] }.",
        )],
    }
}

fn schema_marketplace_identity_sale_history() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_identity_sale_history",
        description: "Fetch the full sale history for a specific @handle identity.",
        inputs: vec![required_string(
            "name",
            "The handle to look up sale history for (with leading @).",
        )],
        outputs: vec![json_output(
            "result",
            "IdentitySaleHistoryResponse { history: IdentitySale[] }.",
        )],
    }
}

fn schema_marketplace_list_bids() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_list_bids",
        description: "List bids on a specific identity auction listing.",
        inputs: vec![required_string(
            "listingId",
            "The listing ID to retrieve bids for.",
        )],
        outputs: vec![json_output(
            "result",
            "BidsResponse { bids: IdentityBid[] }.",
        )],
    }
}

fn schema_marketplace_list_offers() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_list_offers",
        description: "List pending identity offers, optionally filtered by target handle or buyer.",
        inputs: vec![
            optional_string(
                "name",
                "Filter by the @handle the offer targets (for sellers).",
            ),
            optional_string(
                "buyer",
                "Filter by buyer identity (review your own outstanding offers).",
            ),
        ],
        outputs: vec![json_output(
            "result",
            "OffersResponse { offers: IdentityOffer[] }.",
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
        // Identities section
        schema_directory_list_identities(),
        schema_registry_get(),
        schema_marketplace_list_identities(),
        schema_marketplace_identity_floor(),
        schema_marketplace_recent(),
        schema_marketplace_identity_sale_history(),
        schema_marketplace_list_bids(),
        schema_marketplace_list_offers(),
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
        // Identities section
        RegisteredController {
            schema: schema_directory_list_identities(),
            handler: handle_tinyplace_directory_list_identities,
        },
        RegisteredController {
            schema: schema_registry_get(),
            handler: handle_tinyplace_registry_get,
        },
        RegisteredController {
            schema: schema_marketplace_list_identities(),
            handler: handle_tinyplace_marketplace_list_identities,
        },
        RegisteredController {
            schema: schema_marketplace_identity_floor(),
            handler: handle_tinyplace_marketplace_identity_floor,
        },
        RegisteredController {
            schema: schema_marketplace_recent(),
            handler: handle_tinyplace_marketplace_recent,
        },
        RegisteredController {
            schema: schema_marketplace_identity_sale_history(),
            handler: handle_tinyplace_marketplace_identity_sale_history,
        },
        RegisteredController {
            schema: schema_marketplace_list_bids(),
            handler: handle_tinyplace_marketplace_list_bids,
        },
        RegisteredController {
            schema: schema_marketplace_list_offers(),
            handler: handle_tinyplace_marketplace_list_offers,
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
