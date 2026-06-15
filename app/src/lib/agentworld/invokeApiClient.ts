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

// ── Identities section types ──────────────────────────────────────────────────

export interface MarketplacePrice {
  amount: string;
  asset: string;
  network?: string;
  [key: string]: unknown;
}

export interface IdentityListing {
  listingId: string;
  name: string;
  seller?: string;
  sellerCryptoId?: string;
  price: MarketplacePrice;
  reservePrice?: MarketplacePrice;
  highestBid?: { price: MarketplacePrice; [key: string]: unknown };
  listingType?: 'fixed' | 'auction';
  status?: string;
  description?: string;
  expiresAt?: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface IdentitySale {
  saleId: string;
  name: string;
  price: MarketplacePrice;
  buyer: string;
  seller?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface IdentityFloor {
  length?: number;
  price?: MarketplacePrice;
  [key: string]: unknown;
}

export interface IdentityBid {
  bidId?: string;
  listingId?: string;
  bidder?: string;
  price: MarketplacePrice;
  [key: string]: unknown;
}

export interface IdentityOffer {
  offerId: string;
  name?: string;
  buyer: string;
  price: MarketplacePrice;
  status?: string;
  [key: string]: unknown;
}

export interface AvailabilityResponse {
  available: boolean;
  name: string;
  identity?: { cryptoId: string; username?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface IdentityListingQueryParams {
  q?: string;
  tag?: string;
  seller?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface DirectoryIdentityListingsResponse {
  identities: IdentityListing[];
  [key: string]: unknown;
}

export interface IdentitiesResponse {
  identities: IdentityListing[];
  [key: string]: unknown;
}

export interface BidsResponse {
  bids: IdentityBid[];
  [key: string]: unknown;
}

export interface OffersResponse {
  offers: IdentityOffer[];
  [key: string]: unknown;
}

export interface IdentitySaleHistoryResponse {
  history?: IdentitySale[];
  [key: string]: unknown;
}

export interface RecentSalesResponse {
  sales: IdentitySale[];
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

    // ── Identities section ────────────────────────────────────────────────────
    registry: {
      /** Check availability of a @handle (with or without leading @). */
      get: (name: string) =>
        call<AvailabilityResponse>('openhuman.tinyplace_registry_get', { name }),
    },
    marketplace: {
      /** List identity listings, optionally filtered by status and limit. */
      listIdentities: (params?: { limit?: number; status?: string }) =>
        call<IdentitiesResponse>('openhuman.tinyplace_marketplace_list_identities', {
          limit: params?.limit ?? null,
          status: params?.status ?? null,
        }),
      /** Floor price for identity names of a given character length. */
      identityFloor: (length?: number) =>
        call<IdentityFloor>('openhuman.tinyplace_marketplace_identity_floor', {
          length: length ?? null,
        }),
      /** Most recent completed identity sales. */
      recent: () => call<RecentSalesResponse>('openhuman.tinyplace_marketplace_recent'),
      /** Full sale history for a specific @handle. */
      identitySaleHistory: (name: string) =>
        call<IdentitySaleHistoryResponse>('openhuman.tinyplace_marketplace_identity_sale_history', {
          name,
        }),
      /** Bids on an identity auction listing. */
      listBids: (listingId: string) =>
        call<BidsResponse>('openhuman.tinyplace_marketplace_list_bids', { listingId }),
      /** Pending identity offers, filtered by name (seller view) or buyer. */
      listOffers: (params?: { name?: string; buyer?: string }) =>
        call<OffersResponse>('openhuman.tinyplace_marketplace_list_offers', {
          name: params?.name ?? null,
          buyer: params?.buyer ?? null,
        }),
    },
    directoryIdentities: {
      /** List identity listings from the directory. */
      list: (params?: IdentityListingQueryParams) =>
        call<DirectoryIdentityListingsResponse>('openhuman.tinyplace_directory_list_identities', {
          params: params ?? null,
        }),
    },
  };
}

export type InvokeApiClient = ReturnType<typeof createInvokeApiClient>;
