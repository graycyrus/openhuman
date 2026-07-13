/**
 * runStepSummary (issue B20)
 * --------------------------
 *
 * Derives a single plain-language line describing what a workflow step did,
 * for laypeople who don't care about `costUsd`/`labelIds`/`markdownFormatted`
 * or which node kind ran — they want "✅ Sent your daily email summary" or
 * "❌ Couldn't send email: recipient address invalid", not raw Composio JSON.
 *
 * Deliberately generic — no tool-name-specific string matching (no "gmail",
 * no "slack"). It only reasons about the *shape* of the normalized output:
 *
 *   - `FlowRunStep.status` ("success"/"error", when the observer recorded
 *     one — see `services/api/flowsApi.ts`) is the primary success/failure
 *     signal.
 *   - A node can also report engine-level success while the underlying tool
 *     call itself failed — the common Composio tool-call envelope shape is
 *     `{ data, successful, error, costUsd, markdownFormatted }`
 *     (`src/openhuman/tinyflows/caps.rs`) — `successful: false` (with or
 *     without a `status`) is treated as a failure too.
 *   - Known "the tool already told us in plain English" fields (`summary`,
 *     `message`, `text`) are surfaced verbatim when present — this is how a
 *     node like the daily-email-summary agent's `{ summary: "..." }` payload
 *     becomes the primary line instead of being buried in raw JSON.
 *   - Failing that, item/array counts ("Fetched 20 item(s)") give a generic
 *     but still useful line for any tool that returns a list.
 *
 * Internal `flow:`/`run:` ids are never surfaced here — this module only ever
 * sees a step's already-normalized output items, never the `FlowRun` record.
 */
import { type FlowRunItem, isPlainObject } from './runItems';

export type StepOutcome = 'success' | 'error' | 'neutral';

export interface StepSummary {
  outcome: StepOutcome;
  /** Plain-language, already-localized one-line summary (translation-ready inputs applied). */
  text: string;
}

/** Cap the summary line so one verbose tool response can't blow out the layout. */
const MAX_SUMMARY_CHARS = 180;

function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_SUMMARY_CHARS ? `${trimmed.slice(0, MAX_SUMMARY_CHARS)}…` : trimmed;
}

/** Read a string field off a plain object, ignoring blank/non-string values. */
function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Extract a human-readable error reason from a payload: a bare string error,
 * or the common `{ error: "..." }` / `{ error: { message: "..." } }` shapes.
 */
function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (!isPlainObject(payload)) return null;
  const err = payload.error;
  if (typeof err === 'string' && err.trim()) return err;
  if (isPlainObject(err)) {
    const message = stringField(err, 'message');
    if (message) return message;
  }
  return stringField(payload, 'error_message');
}

/** Composio-style tool envelope: `successful: false` marks a failed tool call. */
function isMarkedUnsuccessful(payload: unknown): boolean {
  return isPlainObject(payload) && payload.successful === false;
}

/** The single payload this step's items represent, for summarization purposes. */
function primaryPayload(items: FlowRunItem[]): unknown {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0].json;
  return items.map(item => item.json);
}

/** First array found at the payload's top level or under a `data` field, if any. */
function arrayLength(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length;
  if (isPlainObject(payload) && Array.isArray(payload.data)) return payload.data.length;
  return null;
}

/**
 * Summarize one step's outcome + output into a single plain-language line.
 * `t` is passed in (rather than calling `useT()` here) so this stays a plain,
 * easily-unit-tested function — callers are React components that already
 * hold a `t` from `useT()`.
 */
export function summarizeStep(
  step: { status?: 'success' | 'error' },
  items: FlowRunItem[],
  t: (key: string) => string
): StepSummary {
  const payload = primaryPayload(items);
  const errorMessage = extractErrorMessage(payload);
  const unsuccessful = isMarkedUnsuccessful(payload);
  const failed =
    step.status === 'error' || unsuccessful || (step.status === undefined && !!errorMessage);

  if (failed) {
    const reason = errorMessage ?? t('flowRuns.inspector.summary.unknownError');
    return {
      outcome: 'error',
      text: truncate(`${t('flowRuns.inspector.summary.failedPrefix')} ${reason}`),
    };
  }

  if (isPlainObject(payload)) {
    const summary = stringField(payload, 'summary') ?? stringField(payload, 'message');
    if (summary) return { outcome: 'success', text: truncate(summary) };
  }

  const count = arrayLength(payload);
  if (count !== null) {
    return {
      outcome: 'success',
      text: truncate(
        t('flowRuns.inspector.summary.itemsFetched').replace('{count}', String(count))
      ),
    };
  }

  if (items.length > 1) {
    return {
      outcome: 'success',
      text: truncate(
        t('flowRuns.inspector.summary.itemsProduced').replace('{count}', String(items.length))
      ),
    };
  }

  if (typeof payload === 'string' && payload.trim()) {
    return { outcome: 'success', text: truncate(payload) };
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return { outcome: 'success', text: truncate(String(payload)) };
  }

  if (items.length === 0) {
    return { outcome: 'neutral', text: t('flowRuns.inspector.summary.noOutput') };
  }

  return { outcome: 'success', text: t('flowRuns.inspector.summary.completed') };
}
