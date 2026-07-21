/**
 * Autocomplete commands.
 *
 * Only the in-app inline-suggestion path is exposed here: the Conversations
 * composer polls `autocomplete_current` for a suggestion and applies it via
 * `autocomplete_accept` (with `skip_apply: true`, since the composer inserts
 * the text itself). The system-wide macOS accessibility overlay ("Path A")
 * that used to own start/stop/status/set_style/history was removed — see
 * `src/openhuman/autocomplete/core/engine.rs`.
 */
import { callCoreRpc } from '../../services/coreRpcClient';
import { CommandResponse, isTauri } from './common';

export interface AutocompleteSuggestion {
  value: string;
  confidence: number;
}

export interface AutocompleteCurrentParams {
  context?: string;
}

export interface AutocompleteCurrentResult {
  app_name?: string | null;
  context: string;
  suggestion?: AutocompleteSuggestion | null;
}

export interface AutocompleteAcceptParams {
  suggestion?: string;
  /** When true, skip applying text via accessibility (caller already inserted it). */
  skip_apply?: boolean;
}

export interface AutocompleteAcceptResult {
  accepted: boolean;
  applied: boolean;
  value?: string | null;
  reason?: string | null;
}

export async function openhumanAutocompleteCurrent(
  params?: AutocompleteCurrentParams
): Promise<CommandResponse<AutocompleteCurrentResult>> {
  if (!isTauri()) {
    throw new Error('Not running in Tauri');
  }
  return await callCoreRpc<CommandResponse<AutocompleteCurrentResult>>({
    method: 'openhuman.autocomplete_current',
    params: params ?? {},
  });
}

export async function openhumanAutocompleteAccept(
  params?: AutocompleteAcceptParams
): Promise<CommandResponse<AutocompleteAcceptResult>> {
  if (!isTauri()) {
    throw new Error('Not running in Tauri');
  }
  return await callCoreRpc<CommandResponse<AutocompleteAcceptResult>>({
    method: 'openhuman.autocomplete_accept',
    params: params ?? {},
  });
}
