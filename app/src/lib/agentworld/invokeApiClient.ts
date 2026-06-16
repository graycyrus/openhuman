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

// ── Directory extended types ──────────────────────────────────────────────────

export interface ResolveResponse {
  identity?: unknown;
  agent?: AgentCard;
  [key: string]: unknown;
}

export interface ReverseResponse {
  cryptoId: string;
  identities: unknown[];
  agents?: AgentCard[];
  [key: string]: unknown;
}

export interface IdentityListingQueryParams {
  q?: string;
  tag?: string;
  category?: string;
  seller?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface DirectoryIdentityListingsResponse {
  identities: IdentityListing[];
  cursor?: string;
  [key: string]: unknown;
}

export interface DirectorySkillsParams {
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface AgentSearchResponse {
  agents?: unknown[];
  cursor?: string;
  [key: string]: unknown;
}

// ── Profiles types ────────────────────────────────────────────────────────────

export interface AgentProfile {
  username?: string;
  name?: string;
  description?: string;
  cryptoId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ProfileActivity {
  [key: string]: unknown;
}

export interface ProfileGroupMembership {
  groupId?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ProfileGroupsResponse {
  groups: ProfileGroupMembership[];
  [key: string]: unknown;
}

export interface ProfileBroadcast {
  id?: string;
  content?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ProfileBroadcastsResponse {
  broadcasts: ProfileBroadcast[];
  [key: string]: unknown;
}

export interface ProfileAttestation {
  id?: string;
  attester?: string;
  [key: string]: unknown;
}

export interface ProfileAttestationsResponse {
  attestations: ProfileAttestation[];
  [key: string]: unknown;
}

// ── Users types ───────────────────────────────────────────────────────────────

export interface User {
  cryptoId?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  links?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface UserProfileUpdate {
  displayName?: string;
  bio?: string;
  avatar?: string;
  links?: string[];
  tags?: string[];
  actorType?: string;
  signature?: unknown;
  [key: string]: unknown;
}

export interface AvailabilityResponse {
  available: boolean;
  name: string;
  identity?: { cryptoId: string; username?: string; [key: string]: unknown };
  [key: string]: unknown;
}
export interface BidsResponse {
  bids: IdentityBid[];
  [key: string]: unknown;
}
export interface IdentitiesResponse {
  identities: IdentityListing[];
  [key: string]: unknown;
}
export interface IdentityBid {
  bidId?: string;
  listingId?: string;
  bidder?: string;
  price: MarketplacePrice;
  [key: string]: unknown;
}
export interface IdentityFloor {
  length?: number;
  price?: MarketplacePrice;
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
export interface IdentityOffer {
  offerId: string;
  name?: string;
  buyer: string;
  price: MarketplacePrice;
  status?: string;
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
export interface IdentitySaleHistoryResponse {
  history?: IdentitySale[];
  [key: string]: unknown;
}
export interface MarketplacePrice {
  amount: string;
  asset: string;
  network?: string;
  [key: string]: unknown;
}
export interface OffersResponse {
  offers: IdentityOffer[];
  [key: string]: unknown;
}
export interface RecentSalesResponse {
  sales: IdentitySale[];
  [key: string]: unknown;
}

export interface Artifact {
  artifactId: string;
  owner: string;
  ownerCryptoId?: string;
  name?: string;
  description?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  encryption?: string;
  recipients?: string[];
  recipientCryptoIds?: string[];
  expiresAt?: string;
  maxDownloads?: number;
  downloadCount?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
export interface ArtifactListResult {
  artifacts: Artifact[];
  cursor?: string;
}
export interface ArtifactQueryParams {
  role?: string;
  status?: string;
  referenceKind?: string;
  referenceId?: string;
  limit?: number;
  cursor?: string;
  [key: string]: unknown;
}
export interface CategoriesResponse {
  categories: MarketplaceCategory[];
  [key: string]: unknown;
}
export interface Escrow {
  escrowId: string;
  status: string;
  client: string;
  provider: string;
  [key: string]: unknown;
}
export interface EscrowListResponse {
  escrows: Escrow[];
  [key: string]: unknown;
}
export interface EscrowQueryParams {
  role?: string;
  status?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}
export interface FeaturedResponse {
  items: unknown[];
  [key: string]: unknown;
}
export interface JobListResponse {
  jobs: JobPosting[];
  [key: string]: unknown;
}
export interface JobPosting {
  jobId: string;
  status: string;
  client: string;
  [key: string]: unknown;
}
export interface JobQueryParams {
  status?: string;
  skill?: string;
  q?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}
export interface MarketplaceBrowseResponse {
  [key: string]: unknown;
}
export interface MarketplaceCategory {
  [key: string]: unknown;
}
export interface Product {
  productId: string;
  seller: string;
  sellerCryptoId: string;
  name: string;
  description: string;
  category: string;
  tags?: string[];
  price: MarketplacePrice;
  deliveryMethod: string;
  status: string;
  stock?: number;
  createdAt: string;
  updatedAt: string;
  salesCount: number;
  rating: number;
  signature?: string;
  signerPublicKey?: string;
  [key: string]: unknown;
}
export interface ProductQueryParams {
  q?: string;
  type?: string;
  category?: string;
  tags?: string[];
  seller?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}
export interface ProductReview {
  reviewId?: string;
  productId?: string;
  buyer?: string;
  rating?: number;
  comment?: string;
  [key: string]: unknown;
}
export interface ProductReviewsResponse {
  reviews: ProductReview[];
  [key: string]: unknown;
}
export interface ProductsResponse {
  products: Product[];
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
      resolve: (name: string) =>
        call<ResolveResponse>('openhuman.tinyplace_directory_resolve', { name }),
      reverse: (cryptoId: string) =>
        call<ReverseResponse>('openhuman.tinyplace_directory_reverse', { cryptoId }),
      listIdentities: (params?: IdentityListingQueryParams) =>
        call<DirectoryIdentityListingsResponse>('openhuman.tinyplace_directory_list_identities', {
          params: params ?? null,
        }),
      skills: (params?: DirectorySkillsParams) =>
        call<AgentSearchResponse>('openhuman.tinyplace_directory_skills', {
          params: params ?? null,
        }),
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

    // ── Profiles section ─────────────────────────────────────────────────────
    profiles: {
      get: (username: string) =>
        call<AgentProfile>('openhuman.tinyplace_profiles_get', { username }),
      activity: (username: string) =>
        call<ProfileActivity>('openhuman.tinyplace_profiles_activity', { username }),
      groups: (username: string) =>
        call<ProfileGroupsResponse>('openhuman.tinyplace_profiles_groups', { username }),
      broadcasts: (username: string) =>
        call<ProfileBroadcastsResponse>('openhuman.tinyplace_profiles_broadcasts', { username }),
      attestations: (username: string) =>
        call<ProfileAttestationsResponse>('openhuman.tinyplace_profiles_attestations', {
          username,
        }),
      agentCard: (username: string) =>
        call<AgentCard>('openhuman.tinyplace_profiles_agent_card', { username }),
    },

    // ── Users section ────────────────────────────────────────────────────────
    users: {
      get: (cryptoId: string) => call<User>('openhuman.tinyplace_users_get', { cryptoId }),
      updateProfile: (cryptoId: string, update: UserProfileUpdate) =>
        call<User>('openhuman.tinyplace_users_update_profile', { cryptoId, update }),
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
      browseMarketplace: (params?: ProductQueryParams) =>
        call<MarketplaceBrowseResponse>('openhuman.tinyplace_marketplace_browse', {
          params: params ?? null,
        }),
      listProducts: (params?: ProductQueryParams) =>
        call<ProductsResponse>('openhuman.tinyplace_marketplace_list_products', {
          params: params ?? null,
        }),
      getProduct: (productId: string) =>
        call<Product>('openhuman.tinyplace_marketplace_get_product', { productId }),
      categories: () => call<CategoriesResponse>('openhuman.tinyplace_marketplace_categories'),
      featured: () => call<FeaturedResponse>('openhuman.tinyplace_marketplace_featured'),
      listProductReviews: (productId: string) =>
        call<ProductReviewsResponse>('openhuman.tinyplace_marketplace_list_product_reviews', {
          productId,
        }),
    },
    registry: {
      /** Check availability of a @handle (with or without leading @). */
      get: (name: string) =>
        call<AvailabilityResponse>('openhuman.tinyplace_registry_get', { name }),
    },
    directoryIdentities: {
      /** List identity listings from the directory. */
      list: (params?: IdentityListingQueryParams) =>
        call<DirectoryIdentityListingsResponse>('openhuman.tinyplace_directory_list_identities', {
          params: params ?? null,
        }),
    },
    artifacts: {
      list: (params?: ArtifactQueryParams, actorId?: string) =>
        call<ArtifactListResult>('openhuman.tinyplace_artifacts_list', {
          params: params ?? null,
          ...(actorId !== undefined ? { actorId } : {}),
        }),
      get: (artifactId: string, actorId?: string) =>
        call<Artifact>('openhuman.tinyplace_artifacts_get', {
          artifactId,
          ...(actorId !== undefined ? { actorId } : {}),
        }),
    },
    escrow: {
      list: (params?: EscrowQueryParams) =>
        call<EscrowListResponse>('openhuman.tinyplace_escrow_list', { params: params ?? null }),
      get: (escrowId: string) => call<Escrow>('openhuman.tinyplace_escrow_get', { escrowId }),
    },
    jobs: {
      list: (params?: JobQueryParams) =>
        call<JobListResponse>('openhuman.tinyplace_jobs_list', { params: params ?? null }),
      get: (jobId: string) => call<JobPosting>('openhuman.tinyplace_jobs_get', { jobId }),
    },
  };
}

export type InvokeApiClient = ReturnType<typeof createInvokeApiClient>;
