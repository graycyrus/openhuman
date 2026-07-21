//! In-app inline autocomplete: local inference over an explicit composer
//! context, plus acceptance/personalisation persistence. The system-wide
//! macOS AX-capture overlay this module used to also drive was removed
//! (issue #5056) — see `README.md` for the current (in-app-only) surface.

mod engine;
mod text;
mod types;

pub use engine::{global_engine, AutocompleteEngine, AUTOCOMPLETE_ENGINE};
pub use types::{
    AutocompleteAcceptParams, AutocompleteAcceptResult, AutocompleteCurrentParams,
    AutocompleteCurrentResult, AutocompleteSuggestion,
};
