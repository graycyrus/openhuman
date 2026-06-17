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
    handle_tinyplace_broadcasts_list, handle_tinyplace_broadcasts_subscribe,
    handle_tinyplace_broadcasts_unsubscribe, handle_tinyplace_channels_join,
    handle_tinyplace_channels_leave, handle_tinyplace_channels_list,
    handle_tinyplace_directory_get_agent, handle_tinyplace_directory_list_agents,
    handle_tinyplace_directory_list_identities, handle_tinyplace_directory_resolve,
    handle_tinyplace_directory_reverse, handle_tinyplace_directory_skills,
    handle_tinyplace_escrow_get, handle_tinyplace_escrow_list, handle_tinyplace_explorer_overview,
    handle_tinyplace_groups_join, handle_tinyplace_groups_leave, handle_tinyplace_groups_list,
    handle_tinyplace_inbox_archive, handle_tinyplace_inbox_counts, handle_tinyplace_inbox_list,
    handle_tinyplace_inbox_mark_all_read, handle_tinyplace_inbox_mark_read,
    handle_tinyplace_inbox_remove, handle_tinyplace_inbox_unarchive, handle_tinyplace_jobs_get,
    handle_tinyplace_jobs_list, handle_tinyplace_marketplace_bid,
    handle_tinyplace_marketplace_browse, handle_tinyplace_marketplace_buy_identity,
    handle_tinyplace_marketplace_buy_product, handle_tinyplace_marketplace_categories,
    handle_tinyplace_marketplace_featured, handle_tinyplace_marketplace_get_product,
    handle_tinyplace_marketplace_identity_floor,
    handle_tinyplace_marketplace_identity_sale_history, handle_tinyplace_marketplace_list_bids,
    handle_tinyplace_marketplace_list_identities, handle_tinyplace_marketplace_list_offers,
    handle_tinyplace_marketplace_list_product_reviews, handle_tinyplace_marketplace_list_products,
    handle_tinyplace_marketplace_offer, handle_tinyplace_marketplace_recent,
    handle_tinyplace_profiles_activity, handle_tinyplace_profiles_agent_card,
    handle_tinyplace_profiles_attestations, handle_tinyplace_profiles_broadcasts,
    handle_tinyplace_profiles_get, handle_tinyplace_profiles_groups, handle_tinyplace_registry_get,
    handle_tinyplace_registry_register, handle_tinyplace_search_unified,
    handle_tinyplace_users_get, handle_tinyplace_users_update_profile,
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

fn optional_product_query_params() -> FieldSchema {
    optional_object(
        "params",
        "Optional ProductQueryParams (q, category, seller, tags, minPrice, maxPrice, sortBy, limit, offset).",
    )
}

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

fn schema_directory_resolve() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_resolve",
        description:
            "Resolve a tiny.place name (e.g. 'alice.agent') to its identity and agent card.",
        inputs: vec![required_string(
            "name",
            "The tiny.place name or handle to resolve.",
        )],
        outputs: vec![json_output(
            "result",
            "ResolveResponse with identity and optional AgentCard.",
        )],
    }
}

fn schema_directory_reverse() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_reverse",
        description:
            "Reverse-lookup a crypto_id (base58 Solana address) to its tiny.place identities.",
        inputs: vec![required_string(
            "cryptoId",
            "The base58 Solana address / crypto identity to look up.",
        )],
        outputs: vec![json_output(
            "result",
            "ReverseResponse with the crypto_id, associated identities, and optional agent list.",
        )],
    }
}

fn schema_directory_list_identities() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_list_identities",
        description: "List identity listings in the tiny.place directory, with optional filtering.",
        inputs: vec![optional_object(
            "params",
            "Optional IdentityListingQueryParams (q, tag, category, seller, price range, etc.).",
        )],
        outputs: vec![json_output(
            "result",
            "DirectoryIdentityListingsResponse with identity listings and optional cursor.",
        )],
    }
}

fn schema_directory_skills() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "directory_skills",
        description: "Search for agent skills registered in the tiny.place directory.",
        inputs: vec![optional_object(
            "params",
            "Optional DirectorySkillsParams (q, limit, cursor).",
        )],
        outputs: vec![json_output(
            "result",
            "AgentSearchResponse with matched agents and optional cursor.",
        )],
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

fn buy_confirmed_input() -> FieldSchema {
    FieldSchema {
        name: "confirmed",
        ty: TypeSchema::Option(Box::new(TypeSchema::Bool)),
        comment: "When true, fulfils the x402 payment on-chain and completes the purchase. \
                  Defaults to false (challenge-only, no spend).",
        required: false,
    }
}

fn schema_marketplace_buy_product() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_buy_product",
        description:
            "Buy a marketplace product via x402 confirm-before-spend. confirmed=false returns the \
             402 challenge + wallet balance (no spend); confirmed=true pays and completes the buy.",
        inputs: vec![
            required_string("id", "The product ID to buy."),
            buy_confirmed_input(),
        ],
        outputs: vec![json_output(
            "result",
            "Either { result: ProductPurchase }, { challenge, walletBalance, walletAddress } \
             (unconfirmed), or { result: ProductPurchase, payment: { onChainTx } } (paid).",
        )],
    }
}

fn schema_marketplace_buy_identity() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_buy_identity",
        description:
            "Buy an identity listing (a @handle at its fixed price) via x402 confirm-before-spend. \
             confirmed=false returns the challenge + balance; confirmed=true pays and completes.",
        inputs: vec![
            required_string("id", "The identity listing ID to buy."),
            buy_confirmed_input(),
        ],
        outputs: vec![json_output(
            "result",
            "Either { result: IdentitySale }, { challenge, walletBalance, walletAddress } \
             (unconfirmed), or { result: IdentitySale, payment: { onChainTx } } (paid).",
        )],
    }
}

fn price_inputs() -> Vec<FieldSchema> {
    vec![
        required_string("amount", "Bid/offer amount in the asset's base units."),
        FieldSchema {
            name: "asset",
            ty: TypeSchema::Option(Box::new(TypeSchema::String)),
            comment: "Asset symbol (defaults to USDC).",
            required: false,
        },
        required_string(
            "network",
            "Solana network for the x402 authorization (e.g. the listing's price network).",
        ),
    ]
}

fn schema_marketplace_bid() -> ControllerSchema {
    let mut inputs = vec![required_string(
        "listingId",
        "The auction listing ID to bid on.",
    )];
    inputs.extend(price_inputs());
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_bid",
        description:
            "Place a bid on an identity auction listing. The SDK builds and signs the x402 \
             authorization (an up-to commitment); no on-chain transfer happens until acceptance.",
        inputs,
        outputs: vec![json_output(
            "result",
            "{ result: IdentityListing (updated), committed: true }.",
        )],
    }
}

fn schema_marketplace_offer() -> ControllerSchema {
    let mut inputs = vec![required_string(
        "name",
        "The @handle to make an offer on (with or without a leading @).",
    )];
    inputs.extend(price_inputs());
    ControllerSchema {
        namespace: "tinyplace",
        function: "marketplace_offer",
        description:
            "Make an offer to buy an identity (@handle). The SDK builds and signs the x402 \
             authorization; no on-chain transfer happens until the offer is accepted.",
        inputs,
        outputs: vec![json_output(
            "result",
            "{ result: IdentityOffer, committed: true }.",
        )],
    }
}

fn schema_registry_register() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "registry_register",
        description:
            "Register a @handle via x402 confirm-before-spend. Call with confirmed=false to get the \
             402 challenge + wallet balance (no spend); confirmed=true pays on-chain and registers.",
        inputs: vec![
            required_string("username", "The handle to register (with or without a leading @)."),
            FieldSchema {
                name: "confirmed",
                ty: TypeSchema::Option(Box::new(TypeSchema::Bool)),
                comment: "When true, fulfils the x402 payment on-chain and registers. \
                          Defaults to false (challenge-only, no spend).",
                required: false,
            },
            FieldSchema {
                name: "actorType",
                ty: TypeSchema::Option(Box::new(TypeSchema::String)),
                comment: "Self-declared actor type recorded on the wallet's profile \
                          (\"human\"/\"agent\"). Defaults to \"human\".",
                required: false,
            },
            FieldSchema {
                name: "primary",
                ty: TypeSchema::Option(Box::new(TypeSchema::Bool)),
                comment: "Request this name be assigned as the wallet's primary handle.",
                required: false,
            },
        ],
        outputs: vec![json_output(
            "result",
            "Either { identity } (registered), { challenge, walletBalance, walletAddress } \
             (unconfirmed), or { identity, payment: { onChainTx } } (paid).",
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

fn schema_broadcasts_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "broadcasts_list",
        description:
            "List tiny.place broadcast channels, optionally filtered by query params (read-only).",
        inputs: vec![optional_object(
            "params",
            "Optional BroadcastQueryParams (q, tag, tags, owner, visibility, paymentType, sort, limit).",
        )],
        outputs: vec![json_output(
            "result",
            "Array of BroadcastChannel objects.",
        )],
    }
}

fn schema_channels_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "channels_list",
        description:
            "List public tiny.place channels, optionally filtered by query params (read-only).",
        inputs: vec![optional_object(
            "params",
            "Optional ChannelQueryParams (q, tag, tags, minMembers, maxMembers, sort, limit).",
        )],
        outputs: vec![json_output(
            "result",
            "ChannelListResponse containing a list of Channel objects.",
        )],
    }
}

fn schema_groups_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "groups_list",
        description:
            "List tiny.place groups, optionally filtered by query params (read-only).",
        inputs: vec![optional_object(
            "params",
            "Optional GroupQueryParams (q, tag, tags, membershipPolicy, minMembers, maxMembers, limit).",
        )],
        outputs: vec![json_output(
            "result",
            "Array of GroupMetadata objects.",
        )],
    }
}

fn schema_inbox_counts() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_counts",
        description: "Return inbox unread/read/archived counts for the authenticated agent.",
        inputs: vec![FieldSchema {
            name: "owner",
            ty: TypeSchema::Option(Box::new(TypeSchema::String)),
            comment: "Optional agent ID to count as (directory-auth). Defaults to agent auth.",
            required: false,
        }],
        outputs: vec![json_output(
            "result",
            "InboxCounts with unread, read, archived, byType, and urgent counts.",
        )],
    }
}

fn schema_inbox_list() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_list",
        description: "List inbox items for the authenticated agent (or a named owner).",
        inputs: vec![
            optional_object(
                "params",
                "Optional InboxQueryParams (status, types, from, priority, q, since, before, limit, cursor).",
            ),
            FieldSchema {
                name: "owner",
                ty: TypeSchema::Option(Box::new(TypeSchema::String)),
                comment: "Optional agent ID to list inbox as (directory-auth). Defaults to agent auth.",
                required: false,
            },
        ],
        outputs: vec![json_output(
            "result",
            "InboxListResult containing items, cursor, unreadCount, and totalCount.",
        )],
    }
}

fn optional_owner() -> FieldSchema {
    FieldSchema {
        name: "owner",
        ty: TypeSchema::Option(Box::new(TypeSchema::String)),
        comment: "Optional agent ID to act as (directory-auth). Defaults to agent auth.",
        required: false,
    }
}

fn schema_broadcasts_subscribe() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "broadcasts_subscribe",
        description: "Subscribe to a broadcast channel as the authenticated agent.",
        inputs: vec![required_string(
            "broadcastId",
            "The broadcast ID to subscribe to.",
        )],
        outputs: vec![json_output("result", "BroadcastSubscriber record.")],
    }
}

fn schema_broadcasts_unsubscribe() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "broadcasts_unsubscribe",
        description: "Unsubscribe from a broadcast channel as the authenticated agent.",
        inputs: vec![required_string(
            "broadcastId",
            "The broadcast ID to unsubscribe from.",
        )],
        outputs: vec![json_output("result", "{ ok: true } on success.")],
    }
}

fn schema_channels_join() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "channels_join",
        description: "Join a channel as the authenticated agent.",
        inputs: vec![required_string("channelId", "The channel ID to join.")],
        outputs: vec![json_output(
            "result",
            "ChannelMember for the joined channel.",
        )],
    }
}

fn schema_channels_leave() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "channels_leave",
        description: "Leave a channel as the authenticated agent.",
        inputs: vec![required_string("channelId", "The channel ID to leave.")],
        outputs: vec![json_output("result", "{ ok: true } on success.")],
    }
}

fn schema_groups_join() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "groups_join",
        description: "Join (or request to join) a group as the authenticated agent.",
        inputs: vec![required_string("groupId", "The group ID to join.")],
        outputs: vec![json_output("result", "GroupMember for the joined group.")],
    }
}

fn schema_groups_leave() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "groups_leave",
        description: "Leave a group (removes the authenticated agent from its membership).",
        inputs: vec![required_string("groupId", "The group ID to leave.")],
        outputs: vec![json_output("result", "{ ok: true } on success.")],
    }
}

fn schema_inbox_archive() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_archive",
        description: "Archive a single inbox item.",
        inputs: vec![
            required_string("itemId", "The inbox item ID."),
            optional_owner(),
        ],
        outputs: vec![json_output(
            "result",
            "InboxMarkResult for the archived item.",
        )],
    }
}

fn schema_inbox_mark_all_read() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_mark_all_read",
        description: "Mark all inbox items as read (optionally filtered).",
        inputs: vec![
            optional_object(
                "params",
                "Optional InboxClearParams filter (types, from, before).",
            ),
            optional_owner(),
        ],
        outputs: vec![json_output(
            "result",
            "InboxReadAllResult with the updated count.",
        )],
    }
}

fn schema_inbox_mark_read() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_mark_read",
        description: "Mark a single inbox item as read.",
        inputs: vec![
            required_string("itemId", "The inbox item ID."),
            optional_owner(),
        ],
        outputs: vec![json_output(
            "result",
            "InboxMarkResult for the updated item.",
        )],
    }
}

fn schema_inbox_remove() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_remove",
        description: "Permanently remove a single inbox item.",
        inputs: vec![
            required_string("itemId", "The inbox item ID."),
            optional_owner(),
        ],
        outputs: vec![json_output("result", "{ ok: true } on success.")],
    }
}

fn schema_inbox_unarchive() -> ControllerSchema {
    ControllerSchema {
        namespace: "tinyplace",
        function: "inbox_unarchive",
        description: "Unarchive a single inbox item.",
        inputs: vec![
            required_string("itemId", "The inbox item ID."),
            optional_owner(),
        ],
        outputs: vec![json_output(
            "result",
            "InboxMarkResult for the unarchived item.",
        )],
    }
}

/// All tinyplace controller schemas (for schema discovery / validation).
pub fn all_tinyplace_controller_schemas() -> Vec<ControllerSchema> {
    vec![
        schema_directory_list_agents(),
        schema_directory_get_agent(),
        schema_directory_resolve(),
        schema_directory_reverse(),
        schema_directory_list_identities(),
        schema_directory_skills(),
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
        schema_marketplace_identity_floor(),
        schema_marketplace_identity_sale_history(),
        schema_marketplace_list_bids(),
        schema_marketplace_list_identities(),
        schema_marketplace_list_offers(),
        schema_marketplace_recent(),
        schema_registry_get(),
        schema_registry_register(),
        schema_marketplace_buy_product(),
        schema_marketplace_buy_identity(),
        schema_marketplace_bid(),
        schema_marketplace_offer(),
        schema_artifacts_get(),
        schema_artifacts_list(),
        schema_escrow_get(),
        schema_escrow_list(),
        schema_jobs_get(),
        schema_jobs_list(),
        schema_marketplace_browse(),
        schema_marketplace_categories(),
        schema_marketplace_featured(),
        schema_marketplace_get_product(),
        schema_marketplace_list_product_reviews(),
        schema_marketplace_list_products(),
        schema_broadcasts_list(),
        schema_channels_list(),
        schema_groups_list(),
        schema_inbox_counts(),
        schema_inbox_list(),
        schema_broadcasts_subscribe(),
        schema_broadcasts_unsubscribe(),
        schema_channels_join(),
        schema_channels_leave(),
        schema_groups_join(),
        schema_groups_leave(),
        schema_inbox_archive(),
        schema_inbox_mark_all_read(),
        schema_inbox_mark_read(),
        schema_inbox_remove(),
        schema_inbox_unarchive(),
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
            schema: schema_directory_resolve(),
            handler: handle_tinyplace_directory_resolve,
        },
        RegisteredController {
            schema: schema_directory_reverse(),
            handler: handle_tinyplace_directory_reverse,
        },
        RegisteredController {
            schema: schema_directory_list_identities(),
            handler: handle_tinyplace_directory_list_identities,
        },
        RegisteredController {
            schema: schema_directory_skills(),
            handler: handle_tinyplace_directory_skills,
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
        RegisteredController {
            schema: schema_marketplace_identity_floor(),
            handler: handle_tinyplace_marketplace_identity_floor,
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
            schema: schema_marketplace_list_identities(),
            handler: handle_tinyplace_marketplace_list_identities,
        },
        RegisteredController {
            schema: schema_marketplace_list_offers(),
            handler: handle_tinyplace_marketplace_list_offers,
        },
        RegisteredController {
            schema: schema_marketplace_recent(),
            handler: handle_tinyplace_marketplace_recent,
        },
        RegisteredController {
            schema: schema_registry_get(),
            handler: handle_tinyplace_registry_get,
        },
        RegisteredController {
            schema: schema_registry_register(),
            handler: handle_tinyplace_registry_register,
        },
        RegisteredController {
            schema: schema_marketplace_buy_product(),
            handler: handle_tinyplace_marketplace_buy_product,
        },
        RegisteredController {
            schema: schema_marketplace_buy_identity(),
            handler: handle_tinyplace_marketplace_buy_identity,
        },
        RegisteredController {
            schema: schema_marketplace_bid(),
            handler: handle_tinyplace_marketplace_bid,
        },
        RegisteredController {
            schema: schema_marketplace_offer(),
            handler: handle_tinyplace_marketplace_offer,
        },
        RegisteredController {
            schema: schema_artifacts_get(),
            handler: handle_tinyplace_artifacts_get,
        },
        RegisteredController {
            schema: schema_artifacts_list(),
            handler: handle_tinyplace_artifacts_list,
        },
        RegisteredController {
            schema: schema_escrow_get(),
            handler: handle_tinyplace_escrow_get,
        },
        RegisteredController {
            schema: schema_escrow_list(),
            handler: handle_tinyplace_escrow_list,
        },
        RegisteredController {
            schema: schema_jobs_get(),
            handler: handle_tinyplace_jobs_get,
        },
        RegisteredController {
            schema: schema_jobs_list(),
            handler: handle_tinyplace_jobs_list,
        },
        RegisteredController {
            schema: schema_marketplace_browse(),
            handler: handle_tinyplace_marketplace_browse,
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
            schema: schema_marketplace_get_product(),
            handler: handle_tinyplace_marketplace_get_product,
        },
        RegisteredController {
            schema: schema_marketplace_list_product_reviews(),
            handler: handle_tinyplace_marketplace_list_product_reviews,
        },
        RegisteredController {
            schema: schema_marketplace_list_products(),
            handler: handle_tinyplace_marketplace_list_products,
        },
        RegisteredController {
            schema: schema_broadcasts_list(),
            handler: handle_tinyplace_broadcasts_list,
        },
        RegisteredController {
            schema: schema_channels_list(),
            handler: handle_tinyplace_channels_list,
        },
        RegisteredController {
            schema: schema_groups_list(),
            handler: handle_tinyplace_groups_list,
        },
        RegisteredController {
            schema: schema_inbox_counts(),
            handler: handle_tinyplace_inbox_counts,
        },
        RegisteredController {
            schema: schema_inbox_list(),
            handler: handle_tinyplace_inbox_list,
        },
        RegisteredController {
            schema: schema_broadcasts_subscribe(),
            handler: handle_tinyplace_broadcasts_subscribe,
        },
        RegisteredController {
            schema: schema_broadcasts_unsubscribe(),
            handler: handle_tinyplace_broadcasts_unsubscribe,
        },
        RegisteredController {
            schema: schema_channels_join(),
            handler: handle_tinyplace_channels_join,
        },
        RegisteredController {
            schema: schema_channels_leave(),
            handler: handle_tinyplace_channels_leave,
        },
        RegisteredController {
            schema: schema_groups_join(),
            handler: handle_tinyplace_groups_join,
        },
        RegisteredController {
            schema: schema_groups_leave(),
            handler: handle_tinyplace_groups_leave,
        },
        RegisteredController {
            schema: schema_inbox_archive(),
            handler: handle_tinyplace_inbox_archive,
        },
        RegisteredController {
            schema: schema_inbox_mark_all_read(),
            handler: handle_tinyplace_inbox_mark_all_read,
        },
        RegisteredController {
            schema: schema_inbox_mark_read(),
            handler: handle_tinyplace_inbox_mark_read,
        },
        RegisteredController {
            schema: schema_inbox_remove(),
            handler: handle_tinyplace_inbox_remove,
        },
        RegisteredController {
            schema: schema_inbox_unarchive(),
            handler: handle_tinyplace_inbox_unarchive,
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

    /// Verify the four new Directory section handlers are wired in and have the
    /// expected RPC method names.
    #[test]
    fn directory_section_handlers_are_registered() {
        use crate::core::all::rpc_method_name;
        let expected = [
            "openhuman.tinyplace_directory_resolve",
            "openhuman.tinyplace_directory_reverse",
            "openhuman.tinyplace_directory_list_identities",
            "openhuman.tinyplace_directory_skills",
        ];
        let registered: Vec<String> = all_tinyplace_registered_controllers()
            .into_iter()
            .map(|c| rpc_method_name(&c.schema))
            .collect();
        for method in &expected {
            assert!(
                registered.contains(&method.to_string()),
                "expected handler for {method} to be registered, found: {registered:?}"
            );
        }
    }
}
