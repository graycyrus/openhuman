/**
 * Frontend client for the `openhuman.browser_companion_*` RPC surface
 * (Browser Companion, Part 2 / Stage E2 — the Settings pairing panel). Wraps
 * the six controllers in `src/openhuman/browser_companion/schemas.rs`:
 *   - `status`        — current lifecycle + pairing snapshot (never carries
 *     the pairing secret)
 *   - `enable`        — persist `enabled=true` (+ optional port) and start
 *     the loopback relay
 *   - `disable`       — persist `enabled=false` and stop the relay
 *   - `pair`          — persist an extension id, restart the relay bound to
 *     it, and return fresh pairing material (relay URL + secret)
 *   - `unpair`        — clear the pairing and stop the relay
 *   - `rotate_secret` — rotate the pairing secret (relay restarts if running)
 *
 * Wire shape note: every `browser_companion::schemas` handler goes through
 * `RpcOutcome::single_log`, so `callCoreRpc` resolves `{ result: <payload>,
 * logs: [...] }` — {@link unwrapCliEnvelope} peels that back to the actual
 * payload. This mirrors the private helper of the same name in
 * `flowsApi.ts` / `channelConnectionsApi.ts`.
 *
 * Secret discipline: `pairing_secret` is returned ONLY from `pair` /
 * `rotate_secret` (never from `status`) and callers must treat it as
 * sensitive — hold it in local component state only, never persist it to
 * Redux/localStorage.
 */
import debug from 'debug';

import { callCoreRpc } from '../coreRpcClient';

const log = debug('browserCompanionApi');

// ---------------------------------------------------------------------------
// Wire types — mirror `src/openhuman/browser_companion/types.rs`. No
// rename_all attribute on the Rust structs, so field names are snake_case on
// the wire as-is.
// ---------------------------------------------------------------------------

/** One browser tab the paired extension has explicitly shared with the companion. */
export interface BrowserCompanionSharedTab {
  id: number;
  window_id: number;
  url: string;
  title: string;
}

/**
 * Current lifecycle + pairing snapshot of the Browser Companion relay
 * (`src/openhuman/browser_companion/types.rs::BrowserCompanionStatus`).
 * Deliberately never carries the pairing secret.
 */
export interface BrowserCompanionStatus {
  /**
   * Whether the companion is enabled in config (the user's intent) — distinct
   * from `running`. The relay cannot bind until an extension is paired, so
   * `enabled: true` with `running: false` is the normal "enabled, not yet
   * paired" state. The Settings toggle binds to this, not `running`.
   */
  enabled: boolean;
  running: boolean;
  /** Always `false` when `running` is `false`. */
  extension_connected: boolean;
  paired_extension_id: string | null;
  /** The `ws://127.0.0.1:<port>/v1/extension` URL, present only while running. */
  relay_url: string | null;
  shared_tabs: BrowserCompanionSharedTab[];
}

/**
 * Result of a pair / rotate-secret operation
 * (`src/openhuman/browser_companion/types.rs::PairingInfo`). Treat
 * `pairing_secret` as sensitive — it authenticates the WebSocket upgrade and
 * is never returned from `status`.
 */
export interface BrowserCompanionPairing {
  relay_url: string;
  pairing_secret: string;
}

// ---------------------------------------------------------------------------
// CLI-compatible envelope unwrapping.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Every `browser_companion_*` handler goes through `RpcOutcome::single_log`,
 * so the value `callCoreRpc` resolves is always `{ result: <payload>, logs:
 * string[] }`. Peel that back to `<payload>`. Falls through unchanged if the
 * shape doesn't match (defensive — keeps this client working if a future
 * handler switches to a log-less `RpcOutcome::new` and stops wrapping).
 */
function unwrapCliEnvelope<T>(payload: unknown): T {
  const record = asRecord(payload);
  if (record && 'result' in record && 'logs' in record && Array.isArray(record.logs)) {
    return record.result as T;
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// RPC client.
// ---------------------------------------------------------------------------

/** Current lifecycle + pairing snapshot via `openhuman.browser_companion_status`. */
export async function getBrowserCompanionStatus(): Promise<BrowserCompanionStatus> {
  log('getBrowserCompanionStatus: request');
  const response = await callCoreRpc<unknown>({
    method: 'openhuman.browser_companion_status',
    params: {},
  });
  const status = unwrapCliEnvelope<BrowserCompanionStatus>(response);
  log(
    'getBrowserCompanionStatus: response running=%s extensionConnected=%s',
    status.running,
    status.extension_connected
  );
  return status;
}

/**
 * Enable the Browser Companion relay via `openhuman.browser_companion_enable`.
 * `port` is optional — omit to keep the currently configured port.
 */
export async function enableBrowserCompanion(port?: number): Promise<BrowserCompanionStatus> {
  log('enableBrowserCompanion: request port=%s', port ?? 'default');
  const response = await callCoreRpc<unknown>({
    method: 'openhuman.browser_companion_enable',
    params: port === undefined ? {} : { port },
  });
  const status = unwrapCliEnvelope<BrowserCompanionStatus>(response);
  log('enableBrowserCompanion: response running=%s', status.running);
  return status;
}

/** Disable the Browser Companion relay via `openhuman.browser_companion_disable`. */
export async function disableBrowserCompanion(): Promise<BrowserCompanionStatus> {
  log('disableBrowserCompanion: request');
  const response = await callCoreRpc<unknown>({
    method: 'openhuman.browser_companion_disable',
    params: {},
  });
  const status = unwrapCliEnvelope<BrowserCompanionStatus>(response);
  log('disableBrowserCompanion: response running=%s', status.running);
  return status;
}

/**
 * Pair a Chrome extension id via `openhuman.browser_companion_pair`. Persists
 * the id, restarts the relay bound to it, and returns fresh pairing material
 * (relay URL + secret) — the ONLY response shape that ever carries the secret
 * besides {@link rotateBrowserCompanionSecret}.
 */
export async function pairBrowserCompanionExtension(
  extensionId: string
): Promise<BrowserCompanionPairing> {
  log('pairBrowserCompanionExtension: request extensionIdLen=%d', extensionId.length);
  const response = await callCoreRpc<unknown>({
    method: 'openhuman.browser_companion_pair',
    params: { extension_id: extensionId },
  });
  const pairing = unwrapCliEnvelope<BrowserCompanionPairing>(response);
  log('pairBrowserCompanionExtension: response relay_url=%s', pairing.relay_url);
  return pairing;
}

/**
 * Clear the pairing via `openhuman.browser_companion_unpair`: persists an
 * empty extension id, rotates the pairing secret (invalidating the old one),
 * and stops the relay.
 */
export async function unpairBrowserCompanion(): Promise<BrowserCompanionStatus> {
  log('unpairBrowserCompanion: request');
  const response = await callCoreRpc<unknown>({
    method: 'openhuman.browser_companion_unpair',
    params: {},
  });
  const status = unwrapCliEnvelope<BrowserCompanionStatus>(response);
  log('unpairBrowserCompanion: response running=%s', status.running);
  return status;
}

/**
 * Rotate the pairing secret via `openhuman.browser_companion_rotate_secret`
 * (invalidating the old one). Restarts the relay if it's running so the new
 * secret takes effect.
 */
export async function rotateBrowserCompanionSecret(): Promise<BrowserCompanionPairing> {
  log('rotateBrowserCompanionSecret: request');
  const response = await callCoreRpc<unknown>({
    method: 'openhuman.browser_companion_rotate_secret',
    params: {},
  });
  const pairing = unwrapCliEnvelope<BrowserCompanionPairing>(response);
  log('rotateBrowserCompanionSecret: response relay_url=%s', pairing.relay_url);
  return pairing;
}
