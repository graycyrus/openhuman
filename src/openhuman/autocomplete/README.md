# autocomplete

In-app inline text autocomplete for the OpenHuman chat composer. The composer polls `autocomplete_current` with its current draft text (no accessibility/focus capture involved — the context is passed explicitly), the engine runs **local** (on-device) inference to generate a short single-line continuation, and the composer renders it as ghost text and applies it on Tab via `autocomplete_accept`. Accepted completions are persisted as personalisation examples that feed back into later inference.

A system-wide macOS accessibility overlay used to also live here — it captured the focused text field in *any* frontmost app via AX/osascript, ran the same inference, and rendered a floating suggestion badge with its own Tab/Escape key polling and background refresh loop. That surface ("Path A") was removed (issue #5056): it was dead weight next to the in-app path the composer actually uses ("Path B"), which is all that remains.

## Responsibilities

- Compute an in-app suggestion for the composer's current draft (`current`): sanitize/truncate the context, run local inference to generate a short continuation, filter out low-quality suggestions (too short, no alphanumerics, echo of typed tail), and cache it against the unchanged-context case to avoid redundant inference on repeat polls.
- Accept a suggestion (`accept`): sanitize the value, clear engine state, and persist the acceptance for personalisation.
- Persist accepted completions to the local KV store and a local memory-doc namespace so later inference calls get personalised style examples.

## Key files

| File | Role |
| --- | --- |
| `src/openhuman/autocomplete/mod.rs` | Export-focused root. Re-exports `core::*`, history helpers, `ops` (also aliased as `rpc`), and the controller schema/registry pair. |
| `src/openhuman/autocomplete/ops.rs` | Controller/CLI surface: `autocomplete_current` / `autocomplete_accept` async fns returning `RpcOutcome<T>` with structured `[autocomplete]` logs. |
| `src/openhuman/autocomplete/schemas.rs` | `all_controller_schemas`, `all_registered_controllers`, per-function `ControllerSchema`, and `handle_*` thunks delegating to `ops`. |
| `src/openhuman/autocomplete/history.rs` | Persistence + personalisation: `save_accepted_completion`, `save_completion_to_local_docs`, `query_relevant_examples`, `load_recent_examples`, `list_history`, `clear_history`, and the `AcceptedCompletion` type. |
| `src/openhuman/autocomplete/core/mod.rs` | Engine submodule root; re-exports the engine and public types. |
| `src/openhuman/autocomplete/core/engine.rs` | `AutocompleteEngine` + global singleton (`AUTOCOMPLETE_ENGINE`, `global_engine`). Owns `EngineState`, `current`, `accept`, the in-app `refresh`, and the low-quality-suggestion heuristic. |
| `src/openhuman/autocomplete/core/types.rs` | Serde DTOs (`AutocompleteCurrentParams/Result`, `AutocompleteAcceptParams/Result`, `AutocompleteSuggestion`); `MAX_SUGGESTION_CHARS = 64`. |
| `src/openhuman/autocomplete/core/text.rs` | `sanitize_suggestion`, `truncate_head` and re-exported `truncate_tail`. |
| `src/openhuman/autocomplete/core/engine_tests.rs` | Engine unit tests (`#[path]`-included). |

## Public surface

- Engine: `AutocompleteEngine`, `AUTOCOMPLETE_ENGINE`, `global_engine()`.
- Types: `AutocompleteSuggestion`, `AutocompleteCurrentParams/Result`, `AutocompleteAcceptParams/Result`.
- Ops (also re-exported as `rpc`): `autocomplete_current`, `autocomplete_accept`.
- History: `AcceptedCompletion`, `list_history`, `clear_history`, `load_recent_examples`, `query_relevant_examples`, `save_accepted_completion`, `save_completion_to_local_docs`.
- Schema pair: `all_autocomplete_controller_schemas`, `all_autocomplete_registered_controllers`.

## RPC / controllers

Namespace `autocomplete` (RPC methods `openhuman.autocomplete_<function>`):

| Function | Inputs | Output type | Purpose |
| --- | --- | --- | --- |
| `current` | `context?` | `AutocompleteCurrentResult` | Compute a suggestion for the composer's explicit draft-text context. |
| `accept` | `suggestion?`, `skip_apply?` | `AutocompleteAcceptResult` | Mark a completion accepted and persist it. The composer always sends `skip_apply: true` — it has already inserted the text itself, so there is no accessibility-insertion branch. |

Schemas/handlers wired into the registry via `src/core/all.rs` (no domain branches in `cli.rs`/`jsonrpc.rs`).

## Agent tools

None. This domain owns no agent tools (`tools.rs` absent).

## Events

None. No `bus.rs`.

## Persistence

History (`history.rs`) writes through `MemoryClient::new_local()` (local KV / docs under the default OpenHuman dir), in two layers:

- **KV namespace `autocomplete`** — `AcceptedCompletion` JSON keyed by zero-padded timestamp (`accepted:{ts:018}`) so lexical order == reverse-chronological; trimmed to `MAX_HISTORY_ENTRIES` (50). Powers recency examples (`load_recent_examples`) — no longer surfaced in Settings (the debug panel that listed it was removed).
- **Doc namespace `autocomplete-memory`** — formatted `"[app] ...tail → suggestion"` documents (source_type `autocomplete`, priority `low`, category `daily`), trimmed to `MAX_DOC_ENTRIES` (200), queried semantically by `query_relevant_examples`.

Note: to keep in-app typing latency low, `refresh()` does **not** call `query_relevant_examples`/`load_recent_examples` — only the user's static configured `style_examples` feed the prompt. Those history-query helpers remain for any future caller (and are exercised directly by `tests/autocomplete_memory_e2e.rs`).

Config (`[autocomplete]` in the TOML `Config`) is the durable settings store — `enabled`, `max_chars`, `style_preset`, `style_instructions`, `style_examples` are read by `refresh()`. There is no longer a `set_style` RPC to mutate it at runtime; it's edited via the config file directly.

## Dependencies

- `crate::openhuman::config` (`Config`) — load; the gate for `enabled`, `max_chars`, style fields.
- `crate::openhuman::inference::local` (`local_ai`) — on-device inference via `inline_complete_interactive` (interactive variant bypasses the scheduler LLM permit for low keystroke latency).
- `crate::openhuman::memory_store` (`MemoryClient`, `NamespaceDocumentInput`) — local KV + doc persistence for accepted-completion history.
- `crate::core::all` (`ControllerFuture`, `RegisteredController`) and `crate::core::{ControllerSchema, FieldSchema, TypeSchema}` + `crate::rpc::RpcOutcome` — controller registry plumbing.

## Used by

- `src/core/all.rs` — registers the controller schemas/handlers.
- `app/src/features/conversations/Conversations.tsx` — the only caller; polls `current` and calls `accept` with `skip_apply: true`.

## Notes / gotchas

- **Single process-global engine.** RPC calls share `AUTOCOMPLETE_ENGINE`; there is no background task any more (it was Path A's system-wide refresh loop) — `current` runs its inference inline within the RPC call.
- **In-app only.** There is no macOS-only runtime gate any more; `current`/`accept` work identically on every desktop platform.
- **Confidence is a placeholder** (`0.75`) until `inline_complete` surfaces a real score.
- **`max_chars` clamped by config; `MAX_SUGGESTION_CHARS` (64) caps the displayed/applied suggestion regardless.**
