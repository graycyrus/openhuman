//! System prompt builder for the `bounty_worker` built-in agent.
//!
//! The autonomous, earn-only tiny.place bounty worker. Its body lives in
//! `prompt.md`; we append the live tool list and the shared safety preamble so
//! the worker knows exactly which (earn-only) tools it holds this run.

use crate::openhuman::context::prompt::{render_safety, render_tools, PromptContext};
use anyhow::Result;

const ARCHETYPE: &str = include_str!("prompt.md");

pub fn build(ctx: &PromptContext<'_>) -> Result<String> {
    tracing::debug!(
        agent_id = ctx.agent_id,
        model = ctx.model_name,
        tool_count = ctx.tools.len(),
        "[agent_prompt][bounty_worker] build_start"
    );

    let mut out = String::with_capacity(4096);
    out.push_str(ARCHETYPE.trim_end());
    out.push_str("\n\n");

    let tools = render_tools(ctx)?;
    let tools_present = !tools.trim().is_empty();
    if tools_present {
        out.push_str(tools.trim_end());
        out.push_str("\n\n");
    }

    let safety = render_safety();
    out.push_str(safety.trim_end());
    out.push('\n');

    tracing::trace!(
        agent_id = ctx.agent_id,
        prompt_len = out.len(),
        tools_present,
        "[agent_prompt][bounty_worker] build_done"
    );
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openhuman::context::prompt::{LearnedContextData, ToolCallFormat};
    use std::collections::HashSet;

    fn empty_ctx() -> PromptContext<'static> {
        static EMPTY_VISIBLE: std::sync::OnceLock<HashSet<String>> = std::sync::OnceLock::new();
        PromptContext {
            workspace_dir: std::path::Path::new("."),
            model_name: "test",
            agent_id: "bounty_worker",
            tools: &[],
            workflows: &[],
            dispatcher_instructions: "",
            learned: LearnedContextData::default(),
            visible_tool_names: EMPTY_VISIBLE.get_or_init(HashSet::new),
            tool_call_format: ToolCallFormat::PFormat,
            connected_integrations: &[],
            connected_identities_md: String::new(),
            include_profile: false,
            include_memory_md: false,
            curated_snapshot: None,
            user_identity: None,
            personality_soul_md: None,
            personality_memory_md: None,
            personality_roster: vec![],
        }
    }

    #[test]
    fn build_returns_nonempty_body() {
        let body = build(&empty_ctx()).unwrap();
        assert!(!body.is_empty());
        assert!(body.contains("Bounty Worker"));
    }

    #[test]
    fn archetype_states_earn_only_guardrails() {
        let body = build(&empty_ctx()).unwrap();
        // The earn-only safety posture must survive prompt edits.
        assert!(body.contains("Earn-only"));
        assert!(body.contains("never spend") || body.contains("never spend, fund"));
        assert!(body.contains("Free handles only"));
        // The loop names its core tools so the worker knows its surface.
        assert!(body.contains("tinyplace_find_work"));
        assert!(body.contains("tinyplace_post"));
        assert!(body.contains("tinyplace_submit_work"));
    }
}
