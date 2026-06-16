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
    handle_tinyplace_broadcasts_list, handle_tinyplace_broadcasts_subscribe,
    handle_tinyplace_broadcasts_unsubscribe, handle_tinyplace_channels_join,
    handle_tinyplace_channels_leave, handle_tinyplace_channels_list,
    handle_tinyplace_directory_get_agent, handle_tinyplace_directory_list_agents,
    handle_tinyplace_explorer_overview, handle_tinyplace_groups_join,
    handle_tinyplace_groups_leave, handle_tinyplace_groups_list, handle_tinyplace_inbox_archive,
    handle_tinyplace_inbox_counts, handle_tinyplace_inbox_list,
    handle_tinyplace_inbox_mark_all_read, handle_tinyplace_inbox_mark_read,
    handle_tinyplace_inbox_remove, handle_tinyplace_inbox_unarchive,
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

// ── Messaging section schemas (public metadata reads only — Signal excluded) ──

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

// ── Inbox write-action schemas ────────────────────────────────────────────────

/// Optional `owner` agent-id override (directory-auth); defaults to agent auth.
fn optional_owner() -> FieldSchema {
    FieldSchema {
        name: "owner",
        ty: TypeSchema::Option(Box::new(TypeSchema::String)),
        comment: "Optional agent ID to act as (directory-auth). Defaults to agent auth.",
        required: false,
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

// ── Channels / Broadcasts / Groups membership schemas ─────────────────────────

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

// ── Public exports ────────────────────────────────────────────────────────────

/// All tinyplace controller schemas (for schema discovery / validation).
pub fn all_tinyplace_controller_schemas() -> Vec<ControllerSchema> {
    vec![
        schema_directory_list_agents(),
        schema_directory_get_agent(),
        schema_explorer_overview(),
        schema_search_unified(),
        // Messaging section — public metadata reads
        schema_channels_list(),
        schema_groups_list(),
        schema_broadcasts_list(),
        schema_inbox_list(),
        schema_inbox_counts(),
        // Messaging section — inbox write actions
        schema_inbox_mark_read(),
        schema_inbox_mark_all_read(),
        schema_inbox_archive(),
        schema_inbox_unarchive(),
        schema_inbox_remove(),
        // Messaging section — channel / broadcast / group membership
        schema_channels_join(),
        schema_channels_leave(),
        schema_broadcasts_subscribe(),
        schema_broadcasts_unsubscribe(),
        schema_groups_join(),
        schema_groups_leave(),
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
        // Messaging section — public metadata reads
        RegisteredController {
            schema: schema_channels_list(),
            handler: handle_tinyplace_channels_list,
        },
        RegisteredController {
            schema: schema_groups_list(),
            handler: handle_tinyplace_groups_list,
        },
        RegisteredController {
            schema: schema_broadcasts_list(),
            handler: handle_tinyplace_broadcasts_list,
        },
        RegisteredController {
            schema: schema_inbox_list(),
            handler: handle_tinyplace_inbox_list,
        },
        RegisteredController {
            schema: schema_inbox_counts(),
            handler: handle_tinyplace_inbox_counts,
        },
        // Messaging section — inbox write actions
        RegisteredController {
            schema: schema_inbox_mark_read(),
            handler: handle_tinyplace_inbox_mark_read,
        },
        RegisteredController {
            schema: schema_inbox_mark_all_read(),
            handler: handle_tinyplace_inbox_mark_all_read,
        },
        RegisteredController {
            schema: schema_inbox_archive(),
            handler: handle_tinyplace_inbox_archive,
        },
        RegisteredController {
            schema: schema_inbox_unarchive(),
            handler: handle_tinyplace_inbox_unarchive,
        },
        RegisteredController {
            schema: schema_inbox_remove(),
            handler: handle_tinyplace_inbox_remove,
        },
        // Messaging section — channel / broadcast / group membership
        RegisteredController {
            schema: schema_channels_join(),
            handler: handle_tinyplace_channels_join,
        },
        RegisteredController {
            schema: schema_channels_leave(),
            handler: handle_tinyplace_channels_leave,
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
            schema: schema_groups_join(),
            handler: handle_tinyplace_groups_join,
        },
        RegisteredController {
            schema: schema_groups_leave(),
            handler: handle_tinyplace_groups_leave,
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
