/**
 * tiny.place API client bridge — routes method calls through the OpenHuman
 * core RPC (`openhuman.tinyplace_*`) rather than the tiny.place HTTP API.
 *
 * The factory `createInvokeApiClient()` returns an object whose shape mirrors
 * the tiny.place TypeScript SDK client. Hooks and components in the Agent
 * World tree call it unchanged; this file is the only place where the routing
 * seam is visible.
 *
 * Error conventions:
 * - Transport / non-402 HTTP failures surface as plain `Error`.
 * - 402 Payment Required surfaces as `PaymentRequiredError` with a structured
 *   `challenge` payload (the x402 terms from the backend).
 *
 * Append-point: see the comment block at the bottom of `createInvokeApiClient`
 * for where fan-out section agents add new namespace/method entries.
 */
import { callCoreRpc } from '../../services/coreRpcClient';

// ── Error types ───────────────────────────────────────────────────────────────

/** Thrown when the core returns a `PAYMENT_REQUIRED:<json>` error string. */
export class PaymentRequiredError extends Error {
  readonly challenge: unknown;

  constructor(challenge: unknown) {
    super('PAYMENT_REQUIRED');
    this.name = 'PaymentRequiredError';
    this.challenge = challenge;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}

/**
 * Call a `openhuman.tinyplace_*` core RPC method and return the typed result.
 *
 * If the core returns a string beginning with `"PAYMENT_REQUIRED:"`, this
 * function throws a {@link PaymentRequiredError} with the decoded challenge.
 * All other errors propagate as-is.
 */
async function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  try {
    return await callCoreRpc<T>({ method, params });
  } catch (err) {
    // Core serialises 402 errors as a plain string "PAYMENT_REQUIRED:<json>".
    const msg = String(err);
    const prefix = 'PAYMENT_REQUIRED:';
    if (msg.includes(prefix)) {
      // Extract everything after the prefix, handling cases where the error
      // message has extra surrounding text from JSON-RPC wrapping.
      const idx = msg.indexOf(prefix);
      const payload = msg.slice(idx + prefix.length);
      throw new PaymentRequiredError(safeParseJson(payload));
    }
    throw err;
  }
}

// ── Types (inline minimal stubs — replace with SDK types when available) ──────
//
// These are structural interfaces that describe what the tiny.place backend
// returns. They mirror `sdk/typescript/src/types/`.  We declare them here
// (import-type-only) so the renderer tree never bundles the HTTP SDK runtime.
//
// When `@tinyhumansai/tinyplace` is published and added as a dev-dep, replace
// each `AgentQueryParams`, `AgentCard`, etc. with `import type { … } from
// '@tinyhumansai/tinyplace'`.

export interface AgentQueryParams {
  q?: string;
  skill?: string;
  tag?: string;
  limit?: number;
  cursor?: string;
  [key: string]: unknown;
}

export interface AgentCard {
  agentId: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ListAgentsResponse {
  agents: AgentCard[];
  [key: string]: unknown;
}

export interface ExplorerOverview {
  [key: string]: unknown;
}

export interface SearchResponse {
  results?: unknown[];
  [key: string]: unknown;
}

// ── Messaging section types ───────────────────────────────────────────────────
// Mirrors the Rust SDK types in sdk/rust/src/api/channels.rs, groups.rs,
// broadcasts.rs, and inbox.rs (camelCase wire format).

export interface Channel {
  channelId: string;
  name: string;
  description?: string;
  creator: string;
  memberCount: number;
  isPublic: boolean;
  tags?: string[];
  category?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ChannelListResponse {
  channels: Channel[];
  [key: string]: unknown;
}

export interface ChannelQueryParams {
  q?: string;
  tag?: string;
  tags?: string[];
  minMembers?: number;
  maxMembers?: number;
  sort?: string;
  limit?: number;
  [key: string]: unknown;
}

export interface GroupMetadata {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  membershipPolicy: string;
  memberCount: number;
  membershipEpoch: number;
  tags?: string[];
  [key: string]: unknown;
}

export interface GroupQueryParams {
  q?: string;
  tag?: string;
  tags?: string[];
  membershipPolicy?: string;
  minMembers?: number;
  maxMembers?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface BroadcastChannel {
  broadcastId: string;
  name: string;
  description?: string;
  owner: string;
  subscriberCount: number;
  visibility: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface BroadcastQueryParams {
  q?: string;
  tag?: string;
  tags?: string[];
  owner?: string;
  visibility?: string;
  paymentType?: string;
  sort?: string;
  limit?: number;
  [key: string]: unknown;
}

export interface InboxItem {
  itemId: string;
  type: string;
  status: string;
  priority: string;
  timestamp: string;
  subject: string;
  summary?: string;
  from?: string;
  [key: string]: unknown;
}

export interface InboxListResult {
  items: InboxItem[];
  cursor?: string;
  unreadCount: number;
  totalCount: number;
}

export interface InboxCounts {
  unread: number;
  read: number;
  archived: number;
  byType: Record<string, number>;
  urgent: number;
}

export interface InboxQueryParams {
  status?: string[];
  types?: string[];
  from?: string;
  priority?: string;
  q?: string;
  since?: string;
  before?: string;
  limit?: number;
  cursor?: string;
  [key: string]: unknown;
}

// ── Client factory ────────────────────────────────────────────────────────────

/**
 * Create the Agent World API client.  One instance per app; pass it into the
 * `ApiProvider` in `AgentWorldShell` so all nested hooks call through this.
 *
 * Method names follow the tiny.place SDK convention:
 *   JS `client.<domain>.<camelMethod>` →
 *   RPC `openhuman.tinyplace_<domain>_<snake_method>`
 */
export function createInvokeApiClient() {
  return {
    directory: {
      listAgents: (params?: AgentQueryParams) =>
        call<ListAgentsResponse>('openhuman.tinyplace_directory_list_agents', {
          params: params ?? null,
        }),
      getAgent: (agentId: string) =>
        call<AgentCard>('openhuman.tinyplace_directory_get_agent', { agentId }),
    },
    explorer: { overview: () => call<ExplorerOverview>('openhuman.tinyplace_explorer_overview') },
    search: {
      unified: (query: string) =>
        call<SearchResponse>('openhuman.tinyplace_search_unified', { query }),
    },
    // === AGENT-WORLD BRIDGE NAMESPACES (append here) ===
    // Each fan-out section agent adds one namespace block:
    //   <sectionName>: {
    //     <methodCamel>: (...args) => call<ReturnType>('openhuman.tinyplace_<domain>_<method>', { ...args }),
    //   },

    // ── Messaging section — public metadata reads only (Signal/E2E excluded) ──
    channels: {
      list: (params?: ChannelQueryParams) =>
        call<ChannelListResponse>('openhuman.tinyplace_channels_list', { params: params ?? null }),
      // Membership — result bodies unused (the UI refetches).
      join: (channelId: string) =>
        call<void>('openhuman.tinyplace_channels_join', { channelId }),
      leave: (channelId: string) =>
        call<void>('openhuman.tinyplace_channels_leave', { channelId }),
    },
    groups: {
      list: (params?: GroupQueryParams) =>
        call<GroupMetadata[]>('openhuman.tinyplace_groups_list', { params: params ?? null }),
      join: (groupId: string) => call<void>('openhuman.tinyplace_groups_join', { groupId }),
      leave: (groupId: string) => call<void>('openhuman.tinyplace_groups_leave', { groupId }),
    },
    broadcasts: {
      list: (params?: BroadcastQueryParams) =>
        call<BroadcastChannel[]>('openhuman.tinyplace_broadcasts_list', { params: params ?? null }),
      subscribe: (broadcastId: string) =>
        call<void>('openhuman.tinyplace_broadcasts_subscribe', { broadcastId }),
      unsubscribe: (broadcastId: string) =>
        call<void>('openhuman.tinyplace_broadcasts_unsubscribe', { broadcastId }),
    },
    inbox: {
      list: (params?: InboxQueryParams, owner?: string) =>
        call<InboxListResult>('openhuman.tinyplace_inbox_list', {
          params: params ?? null,
          owner: owner ?? null,
        }),
      counts: (owner?: string) =>
        call<InboxCounts>('openhuman.tinyplace_inbox_counts', { owner: owner ?? null }),
      // Write actions — manage your own inbox. Result bodies are unused (the UI refetches).
      markRead: (itemId: string, owner?: string) =>
        call<void>('openhuman.tinyplace_inbox_mark_read', { itemId, owner: owner ?? null }),
      markAllRead: (owner?: string) =>
        call<void>('openhuman.tinyplace_inbox_mark_all_read', {
          params: null,
          owner: owner ?? null,
        }),
      archive: (itemId: string, owner?: string) =>
        call<void>('openhuman.tinyplace_inbox_archive', { itemId, owner: owner ?? null }),
      unarchive: (itemId: string, owner?: string) =>
        call<void>('openhuman.tinyplace_inbox_unarchive', { itemId, owner: owner ?? null }),
      remove: (itemId: string, owner?: string) =>
        call<void>('openhuman.tinyplace_inbox_remove', { itemId, owner: owner ?? null }),
    },
  };
}

export type InvokeApiClient = ReturnType<typeof createInvokeApiClient>;
