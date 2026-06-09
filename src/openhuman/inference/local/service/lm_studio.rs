use crate::openhuman::config::Config;
use crate::openhuman::inference::local::lm_studio::{
    apply_lm_studio_auth, lm_studio_base_url, estimate_tokens,
    truncate_messages_to_budget, LmStudioChatCompletionRequest,
    LmStudioChatCompletionResponse, LmStudioChatMessage, LmStudioModelsResponse,
    LmStudioModel, DEFAULT_N_CTX, OUTPUT_TOKEN_RESERVE,
};
use crate::openhuman::inference::model_ids;

use super::LocalAiService;

fn diagnostic_body_snippet(body: &str) -> String {
    const MAX_CHARS: usize = 512;
    let mut snippet: String = body.chars().take(MAX_CHARS).collect();
    if body.chars().count() > MAX_CHARS {
        snippet.push_str("...");
    }
    snippet
}

pub(in crate::openhuman::inference::local::service) struct LmStudioCompletionOutcome {
    pub reply: String,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

impl LocalAiService {
    pub(in crate::openhuman::inference::local::service) async fn ensure_lm_studio_available(
        &self,
        config: &Config,
    ) -> Result<(), String> {
        // Probe connectivity only — the server must be reachable. Whether any
        // models are loaded is a separate concern surfaced via diagnostics and
        // the asset-status warning, so bootstrap can succeed and the UI can
        // show an actionable "load a model in LM Studio" CTA instead of a
        // hard error.
        self.list_lm_studio_models(config).await?;
        Ok(())
    }

    pub(in crate::openhuman::inference::local::service) async fn list_lm_studio_models(
        &self,
        config: &Config,
    ) -> Result<Vec<LmStudioModel>, String> {
        let base = lm_studio_base_url(config);
        let url = format!("{base}/models");
        tracing::debug!(
            target: "local_ai::lm_studio",
            %base,
            %url,
            "[local_ai:lm_studio] list_models: sending GET"
        );

        let request = self
            .http
            .get(&url)
            .timeout(std::time::Duration::from_secs(5));
        let response = apply_lm_studio_auth(request, config)
            .send()
            .await
            .map_err(|e| {
                tracing::debug!(
                    target: "local_ai::lm_studio",
                    %url,
                    error = %e,
                    "[local_ai:lm_studio] list_models: request failed"
                );
                format!("lm studio models request failed: {e}")
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let detail = body.trim();
            tracing::debug!(
                target: "local_ai::lm_studio",
                %url,
                %status,
                body = %diagnostic_body_snippet(&body),
                "[local_ai:lm_studio] list_models: non-success response"
            );
            return Err(format!(
                "lm studio models failed with status {}{}",
                status,
                if detail.is_empty() {
                    String::new()
                } else {
                    format!(": {detail}")
                }
            ));
        }

        let body = response.text().await.map_err(|e| {
            tracing::debug!(
                target: "local_ai::lm_studio",
                %url,
                error = %e,
                "[local_ai:lm_studio] list_models: body read failed"
            );
            format!("lm studio models body read failed: {e}")
        })?;
        let payload: LmStudioModelsResponse = serde_json::from_str(&body).map_err(|e| {
            tracing::debug!(
                target: "local_ai::lm_studio",
                %url,
                error = %e,
                body = %diagnostic_body_snippet(&body),
                "[local_ai:lm_studio] list_models: parse failed"
            );
            format!("lm studio models parse failed: {e}")
        })?;

        Ok(payload.data)
    }

    pub(in crate::openhuman::inference::local::service) async fn has_lm_studio_model(
        &self,
        config: &Config,
        model: &str,
    ) -> Result<bool, String> {
        let target = model.trim().to_ascii_lowercase();
        Ok(self
            .list_lm_studio_models(config)
            .await?
            .into_iter()
            .any(|m| m.id.to_ascii_lowercase() == target))
    }

    /// Resolve the context window (`n_ctx`) for a model loaded in LM Studio.
    ///
    /// Queries the LM Studio `/v1/models` endpoint and looks for the
    /// `max_context_length` (or `context_length`) field on the matching
    /// model entry. Returns `None` when the model is not found or the
    /// server did not advertise a context length — callers should fall
    /// back to [`DEFAULT_N_CTX`].
    pub(in crate::openhuman::inference::local::service) async fn resolve_lm_studio_model_context(
        &self,
        config: &Config,
        model_id: &str,
    ) -> Option<u64> {
        let target = model_id.trim().to_ascii_lowercase();
        let models = self.list_lm_studio_models(config).await.ok()?;
        for model in &models {
            if model.id.to_ascii_lowercase() == target {
                return model.context_length;
            }
        }
        None
    }

    pub(in crate::openhuman::inference::local::service) async fn lm_studio_chat_completion(
        &self,
        config: &Config,
        messages: Vec<LmStudioChatMessage>,
        max_tokens: Option<u32>,
        temperature: f32,
        allow_empty: bool,
    ) -> Result<LmStudioCompletionOutcome, String> {
        let base = lm_studio_base_url(config);
        let url = format!("{base}/chat/completions");
        let model = model_ids::effective_chat_model_id(config);

        // ── Context-window guard ──────────────────────────────────────
        // Estimate the prompt token count and truncate messages if they
        // would exceed the model's context window (minus a reserve for
        // output tokens). This prevents LM Studio from returning a 400
        // "context overflow" error when the prompt exceeds the loaded
        // model's `n_ctx`.
        let n_ctx = self
            .resolve_lm_studio_model_context(config, &model)
            .await
            .unwrap_or(DEFAULT_N_CTX);
        let prompt_budget = n_ctx.saturating_sub(OUTPUT_TOKEN_RESERVE);

        let mut messages = messages;
        let estimated_prompt: u64 = messages
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum();
        if estimated_prompt > prompt_budget {
            tracing::warn!(
                target: "local_ai::lm_studio",
                estimated_prompt_tokens = estimated_prompt,
                n_ctx,
                prompt_budget,
                message_count = messages.len(),
                "[local_ai:lm_studio] prompt exceeds context window, truncating"
            );
            truncate_messages_to_budget(&mut messages, prompt_budget);
        }

        tracing::debug!(
            target: "local_ai::lm_studio",
            %url,
            %model,
            message_count = messages.len(),
            max_tokens = ?max_tokens,
            "[local_ai:lm_studio] chat completion: sending POST"
        );

        let body = LmStudioChatCompletionRequest {
            model,
            messages,
            stream: false,
            temperature: Some(temperature),
            max_tokens,
        };

        let request = self
            .http
            .post(&url)
            .timeout(std::time::Duration::from_secs(120))
            .json(&body);
        let response = apply_lm_studio_auth(request, config)
            .send()
            .await
            .map_err(|e| {
                tracing::debug!(
                    target: "local_ai::lm_studio",
                    %url,
                    error = %e,
                    "[local_ai:lm_studio] chat completion: request failed"
                );
                format!("lm studio chat request failed: {e}")
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let detail = body.trim();
            tracing::debug!(
                target: "local_ai::lm_studio",
                %url,
                %status,
                body = %diagnostic_body_snippet(&body),
                "[local_ai:lm_studio] chat completion: non-success response"
            );
            return Err(format!(
                "lm studio chat failed with status {}{}",
                status,
                if detail.is_empty() {
                    String::new()
                } else {
                    format!(": {detail}")
                }
            ));
        }

        let body = response.text().await.map_err(|e| {
            tracing::debug!(
                target: "local_ai::lm_studio",
                %url,
                error = %e,
                "[local_ai:lm_studio] chat completion: body read failed"
            );
            format!("lm studio chat response body read failed: {e}")
        })?;
        let payload: LmStudioChatCompletionResponse = serde_json::from_str(&body).map_err(|e| {
            tracing::debug!(
                target: "local_ai::lm_studio",
                %url,
                error = %e,
                body = %diagnostic_body_snippet(&body),
                "[local_ai:lm_studio] chat completion: parse failed"
            );
            format!("lm studio chat response parse failed: {e}")
        })?;

        let reply = payload
            .choices
            .first()
            .map(|choice| choice.message.effective_content())
            .unwrap_or_default();

        if reply.is_empty() && !allow_empty {
            return Err("lm studio returned empty content".to_string());
        }

        Ok(LmStudioCompletionOutcome {
            reply,
            prompt_tokens: payload.usage.as_ref().and_then(|usage| usage.prompt_tokens),
            completion_tokens: payload
                .usage
                .as_ref()
                .and_then(|usage| usage.completion_tokens),
        })
    }
}
