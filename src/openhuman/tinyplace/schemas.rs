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
    handle_tinyplace_artifacts_get, handle_tinyplace_artifacts_list,
    handle_tinyplace_directory_get_agent, handle_tinyplace_directory_list_agents,
    handle_tinyplace_escrow_get, handle_tinyplace_escrow_list, handle_tinyplace_explorer_overview,
    handle_tinyplace_jobs_get, handle_tinyplace_jobs_list, handle_tinyplace_marketplace_browse,
    handle_tinyplace_marketplace_categories, handle_tinyplace_marketplace_featured,
    handle_tinyplace_marketplace_get_product, handle_tinyplace_marketplace_list_product_reviews,
    handle_tinyplace_marketplace_list_products, handle_tinyplace_search_unified,
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

// ── Marketplace schema definitions ────────────────────────────────────────────

fn optional_product_query_params() -> FieldSchema {
    optional_object(
        "params",
        "Optional ProductQueryParams (q, category, seller, tags, minPrice, maxPrice, sortBy, limit, offset).",
    )
}

fn schema_marketplace_browse() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_browse",
        description: "Browse the combined tiny.place marketplace (products + identity listings).",
        inputs: vec![optional_product_query_params()],
        outputs: vec![json_output(
            "result",
            "MarketplaceBrowseResponse containing products and identity listings.",
        )],
    }
}

fn schema_marketplace_list_products() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_list_products",
        description: "List product listings on the tiny.place marketplace.",
        inputs: vec![optional_product_query_params()],
        outputs: vec![json_output(
            "result",
            "ProductsResponse { products: Product[] }.",
        )],
    }
}

fn schema_marketplace_get_product() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_get_product",
        description: "Fetch a single product by its ID.",
        inputs: vec![required_string(
            "productId",
            "The product's unique identifier.",
        )],
        outputs: vec![json_output("result", "Product object.")],
    }
}

fn schema_marketplace_categories() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_categories",
        description: "List all marketplace product categories.",
        inputs: vec![],
        outputs: vec![json_output(
            "result",
            "CategoriesResponse { categories: MarketplaceCategory[] }.",
        )],
    }
}

fn schema_marketplace_featured() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_featured",
        description: "List featured marketplace items.",
        inputs: vec![],
        outputs: vec![json_output(
            "result",
            "FeaturedResponse { items: unknown[] }.",
        )],
    }
}

fn schema_marketplace_list_product_reviews() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_list_product_reviews",
        description: "List reviews for a product.",
        inputs: vec![required_string(
            "productId",
            "The product whose reviews to fetch.",
        )],
        outputs: vec![json_output(
            "result",
            "ProductReviewsResponse { reviews: ProductReview[] }.",
        )],
    }
}

// ── Artifacts schema definitions ──────────────────────────────────────────────

fn schema_artifacts_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "artifacts_list",
        description: "List encrypted artifacts owned by or shared with the acting agent.",
        inputs: vec![
            optional_object(
                "params",
                "Optional ArtifactQueryParams (role, status, referenceKind, referenceId, limit, cursor).",
            ),
            FieldSchema {
                name: "actorId",
                ty: TypeSchema::Option(Box::new(TypeSchema::String)),
                comment: "Optional agent identity to act as.",
                required: false,
            },
        ],
        outputs: vec![json_output(
            "result",
            "ArtifactListResult { artifacts: Artifact[]; cursor?: string }.",
        )],
    }
}

fn schema_artifacts_get() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "artifacts_get",
        description: "Fetch a single artifact by its ID.",
        inputs: vec![
            required_string("artifactId", "The artifact's unique identifier."),
            FieldSchema {
                name: "actorId",
                ty: TypeSchema::Option(Box::new(TypeSchema::String)),
                comment: "Optional agent identity to act as.",
                required: false,
            },
        ],
        outputs: vec![json_output("result", "Artifact object.")],
    }
}

// ── Escrow schema definitions ─────────────────────────────────────────────────

fn schema_escrow_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "escrow_list",
        description: "List escrow contracts associated with the authenticated agent.",
        inputs: vec![optional_object(
            "params",
            "Optional EscrowQueryParams (role, status, limit, offset).",
        )],
        outputs: vec![json_output(
            "result",
            "EscrowListResponse { escrows: Escrow[] }.",
        )],
    }
}

fn schema_escrow_get() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "escrow_get",
        description: "Fetch a single escrow contract by its ID.",
        inputs: vec![required_string(
            "escrowId",
            "The escrow's unique identifier.",
        )],
        outputs: vec![json_output("result", "Escrow object.")],
    }
}

// ── Jobs schema definitions ───────────────────────────────────────────────────

fn schema_jobs_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "jobs_list",
        description: "List job postings on the tiny.place marketplace.",
        inputs: vec![optional_object(
            "params",
            "Optional JobQueryParams (status, skill, q, limit, offset).",
        )],
        outputs: vec![json_output(
            "result",
            "JobListResponse { jobs: JobPosting[] }.",
        )],
    }
}

fn schema_jobs_get() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "jobs_get",
        description: "Fetch a single job posting by its ID.",
        inputs: vec![required_string(
            "jobId",
            "The job posting's unique identifier.",
        )],
        outputs: vec![json_output("result", "JobPosting object.")],
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
        // Marketplace section
        schema_marketplace_browse(),
        schema_marketplace_list_products(),
        schema_marketplace_get_product(),
        schema_marketplace_categories(),
        schema_marketplace_featured(),
        schema_marketplace_list_product_reviews(),
        // Artifacts section
        schema_artifacts_list(),
        schema_artifacts_get(),
        // Escrow section
        schema_escrow_list(),
        schema_escrow_get(),
        // Jobs section
        schema_jobs_list(),
        schema_jobs_get(),
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
        // Marketplace section
        RegisteredController {
            schema: schema_marketplace_browse(),
            handler: handle_tinyplace_marketplace_browse,
        },
        RegisteredController {
            schema: schema_marketplace_list_products(),
            handler: handle_tinyplace_marketplace_list_products,
        },
        RegisteredController {
            schema: schema_marketplace_get_product(),
            handler: handle_tinyplace_marketplace_get_product,
        },
        RegisteredController {
            schema: schema_marketplace_categories(),
            handler: handle_tinyplace_marketplace_categories,
        },
        RegisteredController {
            schema: schema_marketplace_featured(),
            handler: handle_tinyplace_marketplace_featured,
        },
        RegisteredController {
            schema: schema_marketplace_list_product_reviews(),
            handler: handle_tinyplace_marketplace_list_product_reviews,
        },
        // Artifacts section
        RegisteredController {
            schema: schema_artifacts_list(),
            handler: handle_tinyplace_artifacts_list,
        },
        RegisteredController {
            schema: schema_artifacts_get(),
            handler: handle_tinyplace_artifacts_get,
        },
        // Escrow section
        RegisteredController {
            schema: schema_escrow_list(),
            handler: handle_tinyplace_escrow_list,
        },
        RegisteredController {
            schema: schema_escrow_get(),
            handler: handle_tinyplace_escrow_get,
        },
        // Jobs section
        RegisteredController {
            schema: schema_jobs_list(),
            handler: handle_tinyplace_jobs_list,
        },
        RegisteredController {
            schema: schema_jobs_get(),
            handler: handle_tinyplace_jobs_get,
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
