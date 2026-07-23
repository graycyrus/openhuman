//! Agent tools giving a running flow a private, sandboxed memory namespace
//! (`flow_<flow_id>` — see [`super::flow_namespace`]).
//!
//! Motivating use case: a newsletter-digest flow that runs on a schedule
//! needs to remember which items it already sent so it doesn't re-send them
//! on the next run. Without a durable, flow-scoped place to note "already
//! sent: <item id>", the agent node inside the flow has no way to dedupe
//! across runs other than re-deriving state from the target service itself
//! (which is often lossy or rate-limited).
//!
//! **Security invariant (non-negotiable):** there is no code path here by
//! which a flow can write to — or even name — a namespace other than its
//! own. [`FlowMemoryRememberTool`] derives the namespace internally via
//! [`super::flow_namespace`] from the caller-supplied `flow_id`; there is no
//! `namespace` parameter a caller could override. Every write is tainted
//! [`MemoryTaint::ExternalSync`] (automation output, not user-authored
//! fact), matching the same taint sync pipelines use for third-party
//! content, so the subconscious gate treats it exactly as conservatively.
//! [`FlowMemoryRecallTool`]'s `scope: "flows"` is read-only cross-flow
//! visibility — it can never be used to write outside a flow's own
//! namespace either.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use crate::openhuman::flows::flow_namespace;
use crate::openhuman::memory::{Memory, MemoryCategory, MemoryEntry, MemoryTaint, RecallOpts};
use crate::openhuman::security::policy::ToolOperation;
use crate::openhuman::security::SecurityPolicy;
use crate::openhuman::tools::traits::{PermissionLevel, Tool, ToolResult};

/// The persisted-namespace prefix matching every flow's memory namespace, as
/// [`Memory::namespace_summaries`] returns it.
///
/// This is intentionally the *same* string as
/// [`super::FLOW_MEMORY_NAMESPACE_PREFIX`] (see that constant's doc comment
/// for why the separator is `_` rather than the originally specced `:`) —
/// kept as a separate, explicitly-named constant here so the "match against
/// what recall/list see" intent stays self-evident at each call site,
/// independent of whether the two ever need to diverge in the future.
const FLOW_MEMORY_NAMESPACE_LISTED_PREFIX: &str = super::FLOW_MEMORY_NAMESPACE_PREFIX;

/// Read-only recall over a flow's own memory namespace, or (with
/// `scope: "flows"`) across every flow's namespace.
///
/// `scope: "flows"` is intentionally still read-only and still confined to
/// `flow_*` namespaces — it can never see the user's personal/global memory,
/// only other flows' own automation output.
pub struct FlowMemoryRecallTool {
    memory: Arc<dyn Memory>,
}

impl FlowMemoryRecallTool {
    pub fn new(memory: Arc<dyn Memory>) -> Self {
        Self { memory }
    }
}

/// Renders recall hits the same way [`crate::openhuman::memory::tools::recall`]
/// does, with the flow's memory namespace context in each line so a
/// cross-flow `scope: "flows"` result is attributable.
fn render_entries(entries: &[MemoryEntry]) -> String {
    if entries.is_empty() {
        return "No memories found matching that query.".to_string();
    }
    use std::fmt::Write;
    let mut output = format!("Found {} memories:\n", entries.len());
    for entry in entries {
        let score = entry
            .score
            .map_or_else(String::new, |s| format!(" [{s:.0}%]"));
        let namespace = entry.namespace.as_deref().unwrap_or("?");
        let _ = writeln!(
            output,
            "- [{namespace}] [{}] {}: {}{score}",
            entry.category, entry.key, entry.content
        );
    }
    output
}

#[async_trait]
impl Tool for FlowMemoryRecallTool {
    fn name(&self) -> &str {
        "flow_memory_recall"
    }

    fn description(&self) -> &str {
        "Search a flow's own private memory namespace for relevant facts — e.g. so a scheduled \
         digest flow can check what it already sent before, to avoid duplicates. `scope: \"flow\"` \
         (the default) searches only the calling flow's own namespace. `scope: \"flows\"` searches \
         read-only across every flow's private namespace (useful when related flows should dedupe \
         against each other), merged and re-ranked by relevance. This tool never reads the user's \
         personal or global memory — only memory flows have written about their own runs."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or phrase to search for"
                },
                "flow_id": {
                    "type": "string",
                    "description": "The calling flow's id"
                },
                "scope": {
                    "type": "string",
                    "enum": ["flow", "flows"],
                    "description": "\"flow\" (default) searches only this flow's own memory namespace; \"flows\" searches read-only across every flow's namespace."
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default: 5)"
                }
            },
            "required": ["query", "flow_id"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'query' parameter"))?
            .trim();
        if query.is_empty() {
            return Err(anyhow::anyhow!("query cannot be empty"));
        }
        let flow_id = args
            .get("flow_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'flow_id' parameter"))?
            .trim();
        if flow_id.is_empty() {
            return Err(anyhow::anyhow!("flow_id cannot be empty"));
        }
        let scope = args
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("flow");

        #[allow(clippy::cast_possible_truncation)]
        let limit = args
            .get("limit")
            .and_then(serde_json::Value::as_u64)
            .map_or(5, |v| v as usize);

        match scope {
            "flow" => {
                let namespace = flow_namespace(flow_id);
                let opts = RecallOpts {
                    namespace: Some(namespace.as_str()),
                    ..RecallOpts::default()
                };
                match self.memory.recall(query, limit, opts).await {
                    Ok(entries) => Ok(ToolResult::success(render_entries(&entries))),
                    Err(e) => Ok(ToolResult::error(format!("Flow memory recall failed: {e}"))),
                }
            }
            "flows" => {
                let summaries = match self.memory.namespace_summaries().await {
                    Ok(summaries) => summaries,
                    Err(e) => {
                        return Ok(ToolResult::error(format!(
                            "Failed to list flow memory namespaces: {e}"
                        )))
                    }
                };

                let mut merged: Vec<MemoryEntry> = Vec::new();
                for summary in summaries
                    .iter()
                    .filter(|s| s.namespace.starts_with(FLOW_MEMORY_NAMESPACE_LISTED_PREFIX))
                {
                    let opts = RecallOpts {
                        namespace: Some(summary.namespace.as_str()),
                        ..RecallOpts::default()
                    };
                    match self.memory.recall(query, limit, opts).await {
                        Ok(entries) => merged.extend(entries),
                        Err(e) => {
                            log::warn!(
                                "[flows:memory] flow_memory_recall scope=flows failed for namespace={}: {e}",
                                summary.namespace
                            );
                        }
                    }
                }
                merged.sort_by(|a, b| {
                    b.score
                        .unwrap_or(0.0)
                        .partial_cmp(&a.score.unwrap_or(0.0))
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                merged.truncate(limit);
                Ok(ToolResult::success(render_entries(&merged)))
            }
            other => Ok(ToolResult::error(format!(
                "Unknown scope '{other}': expected 'flow' or 'flows'"
            ))),
        }
    }

    fn is_concurrency_safe(&self, _args: &serde_json::Value) -> bool {
        true
    }
}

/// Write access to a flow's own private memory namespace — and *only* its
/// own. See the module doc for the security invariant this tool exists to
/// preserve.
pub struct FlowMemoryRememberTool {
    memory: Arc<dyn Memory>,
    security: Arc<SecurityPolicy>,
}

impl FlowMemoryRememberTool {
    pub fn new(memory: Arc<dyn Memory>, security: Arc<SecurityPolicy>) -> Self {
        Self { memory, security }
    }
}

#[async_trait]
impl Tool for FlowMemoryRememberTool {
    fn name(&self) -> &str {
        "flow_memory_remember"
    }

    fn description(&self) -> &str {
        "Store a fact in THIS flow's own private memory namespace — e.g. so a scheduled digest \
         flow can remember which items it already sent, to avoid re-sending them on the next run. \
         The namespace is derived internally from `flow_id`; there is no way to target the user's \
         personal memory or another flow's namespace from this tool. Stored content is tainted as \
         externally-sourced automation output, never treated as a user-authored fact."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "flow_id": {
                    "type": "string",
                    "description": "The calling flow's id"
                },
                "key": {
                    "type": "string",
                    "description": "Unique key for this memory within the flow's own namespace"
                },
                "content": {
                    "type": "string",
                    "description": "The information to remember"
                },
                "category": {
                    "type": "string",
                    "description": "Memory category: 'core' (permanent), 'daily' (session), 'conversation' (chat), or a custom category name. Defaults to 'core'."
                }
            },
            "required": ["flow_id", "key", "content"]
        })
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Write
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        let flow_id = args
            .get("flow_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'flow_id' parameter"))?;
        let key = args
            .get("key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'key' parameter"))?;
        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'content' parameter"))?;

        let category = match args.get("category").and_then(|v| v.as_str()) {
            Some("core") | None => MemoryCategory::Core,
            Some("daily") => MemoryCategory::Daily,
            Some("conversation") => MemoryCategory::Conversation,
            // Route custom categories through `FromStr` so a `custom:<name>`
            // wire value resolves back to `Custom("<name>")` rather than
            // double-prefixing — mirrors `memory_store::MemoryStoreTool`.
            Some(other) => other
                .parse()
                .unwrap_or_else(|_| MemoryCategory::Custom(other.to_string())),
        };

        if let Err(error) = self
            .security
            .enforce_tool_operation(ToolOperation::Act, "flow_memory_remember")
        {
            return Ok(ToolResult::error(error));
        }

        let flow_id = flow_id.trim();
        if flow_id.is_empty() {
            return Ok(ToolResult::error("flow_id cannot be empty".to_string()));
        }
        let key = key.trim();
        if key.is_empty() {
            return Ok(ToolResult::error("key cannot be empty".to_string()));
        }

        if crate::openhuman::memory_store::safety::has_likely_secret(content) {
            log::warn!(
                "[flows:memory:safety] flow_memory_remember rejected secret-like content flow_id_chars={} key_chars={} content_chars={}",
                flow_id.chars().count(),
                key.chars().count(),
                content.chars().count()
            );
            return Ok(ToolResult::error(
                "Refusing to store content that looks like a secret. Remove credentials or tokens and try again.".to_string(),
            ));
        }

        // SECURITY: the namespace is derived internally from `flow_id` —
        // this tool has no `namespace` parameter, so a flow can only ever
        // write into its own `flow_<id>` sandbox, never user/global memory
        // or another flow's namespace.
        let namespace = flow_namespace(flow_id);
        let display_key = format!("{namespace}/{key}");
        match self
            .memory
            .store_with_taint(
                &namespace,
                key,
                content,
                category,
                None,
                MemoryTaint::ExternalSync,
            )
            .await
        {
            Ok(()) => Ok(ToolResult::success(format!(
                "Stored flow memory: {display_key}"
            ))),
            Err(e) => Ok(ToolResult::error(format!(
                "Failed to store flow memory: {e}"
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openhuman::embeddings::NoopEmbedding;
    use crate::openhuman::memory_store::UnifiedMemory;
    use crate::openhuman::security::AutonomyLevel;
    use tempfile::TempDir;

    fn test_security() -> Arc<SecurityPolicy> {
        Arc::new(SecurityPolicy::default())
    }

    fn test_mem() -> (TempDir, Arc<dyn Memory>) {
        let tmp = TempDir::new().unwrap();
        let mem = UnifiedMemory::new(tmp.path(), Arc::new(NoopEmbedding), None).unwrap();
        (tmp, Arc::new(mem))
    }

    // ── FlowMemoryRecallTool ────────────────────────────────────────

    #[test]
    fn recall_name_and_schema() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRecallTool::new(mem);
        assert_eq!(tool.name(), "flow_memory_recall");
        let schema = tool.parameters_schema();
        assert!(schema["properties"]["query"].is_object());
        assert!(schema["properties"]["flow_id"].is_object());
        assert!(schema["properties"]["scope"].is_object());
    }

    #[tokio::test]
    async fn recall_empty_returns_no_results() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRecallTool::new(mem);
        let result = tool
            .execute(json!({"query": "anything", "flow_id": "f1"}))
            .await
            .unwrap();
        assert!(!result.is_error);
        assert!(result.output().contains("No memories found"));
    }

    #[tokio::test]
    async fn store_then_recall_matches() {
        let (_tmp, mem) = test_mem();
        mem.store_with_taint(
            &flow_namespace("f1"),
            "sent_item_42",
            "Sent newsletter item 42 to subscribers",
            MemoryCategory::Core,
            None,
            MemoryTaint::ExternalSync,
        )
        .await
        .unwrap();

        let tool = FlowMemoryRecallTool::new(mem);
        let result = tool
            .execute(json!({"query": "newsletter item 42", "flow_id": "f1"}))
            .await
            .unwrap();
        assert!(!result.is_error);
        assert!(result.output().contains("newsletter item 42") || result.output().contains("42"));
        assert!(result.output().contains("Found 1"));
    }

    #[tokio::test]
    async fn scope_flow_isolates_to_own_namespace() {
        let (_tmp, mem) = test_mem();
        mem.store_with_taint(
            &flow_namespace("f1"),
            "k",
            "shared keyword hit",
            MemoryCategory::Core,
            None,
            MemoryTaint::ExternalSync,
        )
        .await
        .unwrap();
        mem.store_with_taint(
            &flow_namespace("f2"),
            "k",
            "shared keyword hit",
            MemoryCategory::Core,
            None,
            MemoryTaint::ExternalSync,
        )
        .await
        .unwrap();

        let tool = FlowMemoryRecallTool::new(mem);
        let result = tool
            .execute(json!({"query": "shared keyword", "flow_id": "f1", "scope": "flow"}))
            .await
            .unwrap();
        assert!(!result.is_error);
        // Only f1's own entry, not f2's.
        assert!(result.output().contains("Found 1"));
    }

    #[tokio::test]
    async fn scope_flows_crosses_namespaces() {
        let (_tmp, mem) = test_mem();
        mem.store_with_taint(
            &flow_namespace("f1"),
            "k",
            "shared keyword hit from f1",
            MemoryCategory::Core,
            None,
            MemoryTaint::ExternalSync,
        )
        .await
        .unwrap();
        mem.store_with_taint(
            &flow_namespace("f2"),
            "k",
            "shared keyword hit from f2",
            MemoryCategory::Core,
            None,
            MemoryTaint::ExternalSync,
        )
        .await
        .unwrap();

        let tool = FlowMemoryRecallTool::new(mem);
        let result = tool
            .execute(json!({"query": "shared keyword", "flow_id": "f1", "scope": "flows"}))
            .await
            .unwrap();
        assert!(!result.is_error);
        // Both f1's and f2's namespaces are visible under scope="flows".
        assert!(result.output().contains("Found 2"));
    }

    #[tokio::test]
    async fn recall_missing_query_errs() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRecallTool::new(mem);
        let result = tool.execute(json!({"flow_id": "f1"})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn recall_missing_flow_id_errs() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRecallTool::new(mem);
        let result = tool.execute(json!({"query": "anything"})).await;
        assert!(result.is_err());
    }

    // ── FlowMemoryRememberTool ──────────────────────────────────────

    #[test]
    fn remember_name_and_schema() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRememberTool::new(mem, test_security());
        assert_eq!(tool.name(), "flow_memory_remember");
        let schema = tool.parameters_schema();
        assert!(schema["properties"]["flow_id"].is_object());
        assert!(schema["properties"]["key"].is_object());
        assert!(schema["properties"]["content"].is_object());
        // No `namespace` parameter exists — the security invariant that a
        // flow can never target another namespace.
        assert!(schema["properties"]["namespace"].is_null());
        assert_eq!(tool.permission_level(), PermissionLevel::Write);
    }

    #[tokio::test]
    async fn remember_stores_with_external_sync_taint() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRememberTool::new(mem.clone(), test_security());
        let result = tool
            .execute(json!({"flow_id": "f1", "key": "sent_item_42", "content": "Sent item 42"}))
            .await
            .unwrap();
        assert!(!result.is_error);

        let entry = mem
            .get(&flow_namespace("f1"), "sent_item_42")
            .await
            .unwrap()
            .expect("entry should be stored");
        assert_eq!(entry.content, "Sent item 42");
        assert_eq!(entry.taint, MemoryTaint::ExternalSync);
    }

    #[tokio::test]
    async fn remember_writes_only_to_own_flow_namespace() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRememberTool::new(mem.clone(), test_security());
        tool.execute(json!({"flow_id": "f1", "key": "k", "content": "f1 content"}))
            .await
            .unwrap();

        // Never lands in another flow's namespace, the shared "flows" scope
        // namespace, or global/user memory.
        assert!(mem
            .get(&flow_namespace("f2"), "k")
            .await
            .unwrap()
            .is_none());
        assert!(mem.get("global", "k").await.unwrap().is_none());
        assert!(mem
            .get("f1", "k") // raw flow_id, not the derived namespace
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn remember_blocked_in_readonly_autonomy() {
        let (_tmp, mem) = test_mem();
        let readonly = Arc::new(SecurityPolicy {
            autonomy: AutonomyLevel::ReadOnly,
            ..SecurityPolicy::default()
        });
        let tool = FlowMemoryRememberTool::new(mem.clone(), readonly);
        let result = tool
            .execute(json!({"flow_id": "f1", "key": "k", "content": "blocked"}))
            .await
            .unwrap();
        assert!(result.is_error);
        assert!(result.output().contains("read-only mode"));
        assert!(mem.get(&flow_namespace("f1"), "k").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn remember_rejects_secret_like_content() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRememberTool::new(mem.clone(), test_security());
        let result = tool
            .execute(json!({
                "flow_id": "f1",
                "key": "api",
                "content": "api_key=sk-123456789012345678901234567890"
            }))
            .await
            .unwrap();
        assert!(result.is_error);
        assert!(result.output().contains("looks like a secret"));
        assert!(mem
            .get(&flow_namespace("f1"), "api")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn remember_missing_flow_id_errs() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRememberTool::new(mem, test_security());
        let result = tool.execute(json!({"key": "k", "content": "c"})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn remember_missing_content_errs() {
        let (_tmp, mem) = test_mem();
        let tool = FlowMemoryRememberTool::new(mem, test_security());
        let result = tool
            .execute(json!({"flow_id": "f1", "key": "k"}))
            .await;
        assert!(result.is_err());
    }
}
