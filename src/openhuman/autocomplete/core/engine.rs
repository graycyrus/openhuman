use crate::openhuman::config::Config;
use crate::openhuman::inference::local as local_ai;
use chrono::Utc;
use once_cell::sync::Lazy;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::text::{sanitize_suggestion, truncate_tail};
use super::types::{
    AutocompleteAcceptParams, AutocompleteAcceptResult, AutocompleteCurrentParams,
    AutocompleteCurrentResult, AutocompleteSuggestion,
};

/// In-app composer's own display name, stamped onto state so `current()`
/// callers (and the accepted-completion history writer) have a stable
/// `app_name` even though there is no AX capture behind it any more.
const IN_APP_NAME: &str = "OpenHuman";

struct EngineState {
    phase: String,
    app_name: Option<String>,
    context: String,
    suggestion: Option<AutocompleteSuggestion>,
    last_error: Option<String>,
    updated_at_ms: Option<i64>,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            phase: "idle".to_string(),
            app_name: None,
            context: String::new(),
            suggestion: None,
            last_error: None,
            updated_at_ms: None,
        }
    }
}

/// In-app inline autocomplete engine.
///
/// This used to also drive a system-wide macOS accessibility overlay (AX
/// capture of the focused field in *any* app, Tab/Escape key polling, a
/// floating suggestion badge) — that surface ("Path A") was removed; see
/// the module doc comment on `crate::openhuman::autocomplete::core`. What
/// remains is the in-app path the OpenHuman composer drives directly:
/// `current()` (poll for a suggestion against an explicit context) and
/// `accept()` (mark a suggestion accepted and persist it for
/// personalisation).
pub struct AutocompleteEngine {
    inner: Mutex<EngineState>,
}

impl Default for AutocompleteEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AutocompleteEngine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(EngineState::default()),
        }
    }

    /// Compute the current suggestion for the given (or previously captured)
    /// context. The OpenHuman composer always supplies `context` explicitly
    /// (`AutocompleteCurrentParams.context`); there is no other caller.
    pub async fn current(
        &self,
        params: Option<AutocompleteCurrentParams>,
    ) -> Result<AutocompleteCurrentResult, String> {
        let context_override = params
            .and_then(|p| p.context)
            .filter(|c| !c.trim().is_empty());
        if let Err(err) = self.refresh(context_override).await {
            // Ensure an inference failure here cannot leave phase stuck at
            // "generating".
            let mut state = self.inner.lock().await;
            state.phase = "error".to_string();
            state.last_error = Some(err.clone());
            state.updated_at_ms = Some(Utc::now().timestamp_millis());
            return Err(err);
        }
        let state = self.inner.lock().await;
        Ok(AutocompleteCurrentResult {
            app_name: state.app_name.clone(),
            context: state.context.clone(),
            suggestion: state.suggestion.clone(),
        })
    }

    /// Accept the current (or explicitly supplied) suggestion. The composer
    /// always sends `skip_apply: true` — it has already inserted the text
    /// itself — so there is no accessibility-insertion branch here any more.
    pub async fn accept(
        &self,
        params: AutocompleteAcceptParams,
    ) -> Result<AutocompleteAcceptResult, String> {
        let value = if let Some(value) = params.suggestion {
            value
        } else {
            let state = self.inner.lock().await;
            state
                .suggestion
                .as_ref()
                .map(|s| s.value.clone())
                .unwrap_or_default()
        };

        let cleaned = sanitize_suggestion(&value);
        if cleaned.is_empty() {
            return Ok(AutocompleteAcceptResult {
                accepted: false,
                applied: false,
                value: None,
                reason: Some("no suggestion available".to_string()),
            });
        }

        let (ctx, app) = {
            let mut state = self.inner.lock().await;
            let snapshot = (state.context.clone(), state.app_name.clone());
            state.suggestion = None;
            state.phase = "idle".to_string();
            state.last_error = None;
            state.updated_at_ms = Some(Utc::now().timestamp_millis());
            snapshot
        };

        // Persist acceptance for personalisation (fire-and-forget).
        // Dual-write: KV (UI list) + local docs (semantic search).
        {
            let sug = cleaned.clone();
            tokio::spawn(async move {
                crate::openhuman::autocomplete::history::save_accepted_completion(
                    &ctx,
                    &sug,
                    app.as_deref(),
                )
                .await;
                crate::openhuman::autocomplete::history::save_completion_to_local_docs(
                    &ctx,
                    &sug,
                    app.as_deref(),
                )
                .await;
            });
        }

        Ok(AutocompleteAcceptResult {
            accepted: true,
            applied: false,
            value: Some(cleaned),
            reason: None,
        })
    }

    /// In-app-only refresh. `context_override` is the composer's current
    /// draft text (or `None` when there is nothing to score against).
    async fn refresh(&self, context_override: Option<String>) -> Result<(), String> {
        let config = Config::load_or_init()
            .await
            .map_err(|e| format!("failed to load config: {e}"))?;
        if !config.autocomplete.enabled {
            let mut state = self.inner.lock().await;
            state.suggestion = None;
            state.phase = "disabled".to_string();
            return Ok(());
        }

        let Some(context_text) = context_override else {
            let mut state = self.inner.lock().await;
            state.suggestion = None;
            state.phase = "idle".to_string();
            return Ok(());
        };

        {
            let mut state = self.inner.lock().await;
            state.phase = "capturing_context".to_string();
        }

        let context = truncate_tail(&context_text, config.autocomplete.max_chars);
        if context.trim().is_empty() {
            let mut state = self.inner.lock().await;
            state.app_name = Some(IN_APP_NAME.to_string());
            state.context = context;
            state.suggestion = None;
            state.phase = "idle".to_string();
            state.updated_at_ms = Some(Utc::now().timestamp_millis());
            return Ok(());
        }

        // Short-circuit: unchanged context and we already have a suggestion —
        // skip inference (the composer polls frequently; this avoids
        // re-running the model on every poll while the user isn't typing).
        {
            let mut state = self.inner.lock().await;
            if state.context == context && state.suggestion.is_some() {
                log::debug!("[autocomplete] context unchanged, returning cached suggestion");
                return Ok(());
            }
            state.app_name = Some(IN_APP_NAME.to_string());
            state.updated_at_ms = Some(Utc::now().timestamp_millis());
        }

        {
            let mut state = self.inner.lock().await;
            if state.phase == "generating" {
                let now_ms = Utc::now().timestamp_millis();
                let generating_age_ms = state
                    .updated_at_ms
                    .map(|ts| now_ms.saturating_sub(ts))
                    .unwrap_or(0);
                // Self-heal stale generating state so inference cannot freeze.
                if generating_age_ms > 12_000 {
                    log::warn!(
                        "[autocomplete] detected stale generating phase (age={}ms); resetting to continue inference",
                        generating_age_ms
                    );
                    state.phase = "idle".to_string();
                } else {
                    log::debug!(
                        "[autocomplete] skipping refresh while generation is in-flight (context_chars={}, age={}ms)",
                        context.chars().count(),
                        generating_age_ms
                    );
                    return Ok(());
                }
            }
            state.phase = "generating".to_string();
            state.updated_at_ms = Some(Utc::now().timestamp_millis());
        }
        let service = local_ai::global(&config);

        // Keep in-app typing latency low by skipping the local-memory
        // (semantic/recency) example lookups the system-wide overlay used to
        // do; only the user's static configured examples feed the prompt.
        let merged_examples: Vec<String> = config
            .autocomplete
            .style_examples
            .iter()
            .take(8)
            .cloned()
            .collect();

        // Interactive variant — bypasses the scheduler_gate's LLM permit
        // so per-keystroke autocomplete doesn't queue behind a memory-tree
        // backfill or a triage turn. See `inline_complete_interactive`
        // docs in `inference/local/service/public_infer.rs`.
        let generated = match service
            .inline_complete_interactive(
                &config,
                &context,
                &config.autocomplete.style_preset,
                config.autocomplete.style_instructions.as_deref(),
                &merged_examples,
                Some(24),
            )
            .await
        {
            Ok(value) => value,
            Err(err) => {
                let mut state = self.inner.lock().await;
                state.phase = "error".to_string();
                state.last_error = Some(err.clone());
                state.updated_at_ms = Some(Utc::now().timestamp_millis());
                return Err(err);
            }
        };

        let suggestion = sanitize_suggestion(&generated);
        let low_quality = is_low_quality_suggestion(&suggestion, &context);
        let mut state = self.inner.lock().await;
        state.app_name = Some(IN_APP_NAME.to_string());
        state.context = context;
        state.updated_at_ms = Some(Utc::now().timestamp_millis());
        if suggestion.is_empty() || low_quality {
            if low_quality {
                log::debug!(
                    "[autocomplete] dropping low-quality suggestion: {:?}",
                    suggestion
                );
            }
            state.suggestion = None;
            state.phase = "idle".to_string();
            state.last_error = None;
            return Ok(());
        }
        state.suggestion = Some(AutocompleteSuggestion {
            value: suggestion,
            // Placeholder until `local_ai::inline_complete` surfaces a real score (avoid 0.0 so UI/thresholds keep signal).
            confidence: 0.75,
        });
        state.phase = "ready".to_string();
        state.last_error = None;
        Ok(())
    }
}

pub static AUTOCOMPLETE_ENGINE: Lazy<Arc<AutocompleteEngine>> =
    Lazy::new(|| Arc::new(AutocompleteEngine::new()));

pub fn global_engine() -> Arc<AutocompleteEngine> {
    AUTOCOMPLETE_ENGINE.clone()
}

/// Reject obviously useless suggestions before they reach the caller.
/// Filters: too-short, pure whitespace/punct, or exact echo of the trailing context.
fn is_low_quality_suggestion(suggestion: &str, context: &str) -> bool {
    let trimmed = suggestion.trim();
    if trimmed.chars().count() < 2 {
        return true;
    }
    if !trimmed.chars().any(|c| c.is_alphanumeric()) {
        return true;
    }
    // Suggestion is a substring of the tail the user already typed — useless echo.
    let tail_window = context
        .chars()
        .rev()
        .take(trimmed.chars().count() + 8)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    if tail_window.contains(trimmed) {
        return true;
    }
    false
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
