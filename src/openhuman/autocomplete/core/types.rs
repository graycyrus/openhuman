use serde::{Deserialize, Serialize};

pub(crate) const MAX_SUGGESTION_CHARS: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutocompleteSuggestion {
    pub value: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutocompleteCurrentParams {
    pub context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutocompleteCurrentResult {
    pub app_name: Option<String>,
    pub context: String,
    pub suggestion: Option<AutocompleteSuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutocompleteAcceptParams {
    pub suggestion: Option<String>,
    /// When true, skip applying text via accessibility (caller already inserted it).
    pub skip_apply: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutocompleteAcceptResult {
    pub accepted: bool,
    pub applied: bool,
    pub value: Option<String>,
    pub reason: Option<String>,
}
