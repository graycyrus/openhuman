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
  cryptoId: string;
  actorType: string;
  displayName: string;
  bio: string;
  avatarEmail?: string;
  email?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  emailVerificationRequestedAt?: string;
  harnessKey?: string;
  link?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface UserProfileUpdate {
  displayName?: string;
  bio?: string;
  avatarEmail?: string;
  harnessKey?: string;
  link?: string;
  tags?: string[];
  actorType?: string;
  signature?: unknown;
  [key: string]: unknown;
}

// ── Users email verification types ──────────────────────────────────────────

export interface UserEmailVerificationStartParams {
  cryptoId: string;
  email: string;
}

export interface UserEmailVerificationConfirmParams {
  cryptoId: string;
  email: string;
  code: string;
}

export interface AvailabilityResponse {
  available: boolean;
  name: string;
  identity?: { cryptoId: string; username?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// ── Registry (x402 register) types ─────────────────────────────────────────────

export interface RegisterParams {
  username: string;
  /** false/omitted → challenge only (no spend); true → pay + register. */
  confirmed?: boolean;
  /** "human" (default) or "agent". */
  actorType?: string;
  primary?: boolean;
}

export interface RegistryWalletBalance {
  raw: string;
  formatted: string;
  decimals: number;
  assetSymbol: string;
}

/** The x402 payment terms surfaced on an unconfirmed register call. */
export interface RegistrationChallenge {
  amount?: string;
  asset?: string;
  network?: string;
  to?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface RegisteredIdentity {
  username?: string;
  cryptoId?: string;
  [key: string]: unknown;
}

/**
 * Result of `registry.register`. Exactly one of these shapes is populated:
 * - `{ identity }` — registered (free tier or after payment).
 * - `{ challenge, walletBalance, walletAddress }` — unconfirmed; render confirm.
 * - `{ identity, payment }` — paid + registered.
 */
export interface RegistrationResult {
  identity?: RegisteredIdentity;
  challenge?: RegistrationChallenge;
  walletBalance?: RegistryWalletBalance | null;
  walletAddress?: string;
  payment?: { onChainTx?: string };
  [key: string]: unknown;
}

// -- Registry export types ------------------------------------------------

export interface LedgerReference {
  kind: string;
  id?: string;
  parentTxId?: string;
  rate?: string;
  [key: string]: unknown;
}

export interface LedgerTransaction {
  txId: string;
  visibility: string;
  type: string;
  from?: string;
  to?: string;
  amount?: string;
  asset?: string;
  network: string;
  timestamp: string;
  reference?: LedgerReference;
  onChainTx: string;
  status: string;
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

export interface IdentityOwnershipProof {
  algorithm: string;
  cryptoId: string;
  publicKey: string;
  publicKeyMatchesCryptoId: boolean;
  [key: string]: unknown;
}

export interface IdentityLedgerReferenceProof {
  txId: string;
  onChainTx: string;
  network: string;
  status: string;
  type: string;
  reference: LedgerReference;
  [key: string]: unknown;
}

export interface IdentityExportProofs {
  ownership: IdentityOwnershipProof;
  ledgerReferences: IdentityLedgerReferenceProof[];
  [key: string]: unknown;
}

export interface IdentityExport {
  identity: AvailabilityResponse['identity'];
  ledgerTransactions: LedgerTransaction[];
  exportedAt: string;
  verification: Record<string, string>;
  proofs: IdentityExportProofs;
  [key: string]: unknown;
}

/**
 * Result of an x402 buy (`marketplace.buyProduct` / `buyIdentity`). Exactly one
 * shape is populated:
 * - `{ result }` — purchased (free tier, no payment needed).
 * - `{ challenge, walletBalance, walletAddress }` — unconfirmed; render confirm.
 * - `{ result, payment: { onChainTx } }` — paid + purchased.
 */
export interface X402BuyResult {
  result?: Record<string, unknown>;
  challenge?: RegistrationChallenge;
  walletBalance?: RegistryWalletBalance | null;
  walletAddress?: string;
  payment?: { onChainTx?: string };
  [key: string]: unknown;
}

/**
 * Result of an x402 commitment (`marketplace.bid` / `offer`). Bids/offers are
 * signed authorizations — no on-chain transfer until acceptance — so the result
 * is `{ result, committed: true }` (no `payment.onChainTx`).
 */
export interface X402CommitResult {
  result?: Record<string, unknown>;
  committed?: boolean;
  [key: string]: unknown;
}

/** Amount + (optional) asset + network for a bid/offer commitment. */
export interface CommitPriceParams {
  amount: string;
  asset?: string;
  network: string;
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
// ── Groups invite/role types ────────────────────────────────────────────────

export interface GroupMember {
  groupId: string;
  agentId: string;
  role: string;
  status: string;
  joinedAt: string;
  updatedAt: string;
  subscriptionInterval?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  subscriptionGraceEnd?: string;
  autoRenew?: boolean;
  [key: string]: unknown;
}

export interface GroupInvite {
  groupId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  maxUses?: number;
  uses: number;
  revoked?: boolean;
  [key: string]: unknown;
}

export interface GroupInviteCreateRequest {
  ttlSeconds?: number;
  maxUses?: number;
}

export interface GroupInvitePreview {
  groupId: string;
  name: string;
  description?: string;
  memberCount: number;
  membershipPolicy: string;
  invitedBy: string;
  valid: boolean;
  [key: string]: unknown;
}

export interface InboxCounts {
  unread: number;
  read: number;
  archived: number;
  byType: Record<string, number>;
  urgent: number;
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

// ── Follows types ───────────────────────────────────────────────────────────

export interface AgentFollow {
  follower: string;
  followee: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface FollowStats {
  agentId: string;
  followerCount: number;
  followingCount: number;
  [key: string]: unknown;
}

export interface FollowListParams {
  limit?: number;
  offset?: number;
}

export interface FollowersResponse {
  followers: AgentFollow[];
  [key: string]: unknown;
}

export interface FollowingResponse {
  following: AgentFollow[];
  [key: string]: unknown;
}

export interface FeedListParams {
  limit?: number;
  offset?: number;
  kind?: string;
  category?: string;
  since?: string;
  includeSelf?: boolean;
}

export interface ActivityEvent {
  eventId: string;
  kind: string;
  category: string;
  actor?: string;
  target?: string;
  amount?: string;
  asset?: string;
  network?: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface ActivityStats {
  total: number;
  byKind: Record<string, number>;
  byCategory: Record<string, number>;
  [key: string]: unknown;
}

export interface FeedResponse {
  events: ActivityEvent[];
  following: AgentFollow[];
  stats: ActivityStats;
  [key: string]: unknown;
}

// ── Feedback types ──────────────────────────────────────────────────────────

export interface FeedbackItem {
  feedbackId: string;
  author: string;
  title: string;
  description: string;
  category?: string;
  status: string;
  votesUp: number;
  votesDown: number;
  score: number;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  mergedAt?: string;
  adminNote?: string;
  mergedReference?: string;
  reputationPoints?: number;
  [key: string]: unknown;
}

export interface FeedbackListParams {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface FeedbackListResponse {
  feedback: FeedbackItem[];
  [key: string]: unknown;
}

// ── Solana types ────────────────────────────────────────────────────────────

export interface SolanaRpcInfo {
  url: string;
  rateLimitPerMin: number;
  fallbacks: boolean;
  [key: string]: unknown;
}

export interface SupportedAsset {
  symbol: string;
  address?: string;
  decimals: number;
  [key: string]: unknown;
}

export interface SolanaChainInfo {
  network: string;
  name: string;
  kind: string;
  nativeAsset: string;
  explorerUrl: string;
  confirmations: number;
  assets: SupportedAsset[];
  rpc: SolanaRpcInfo;
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
      /** Start email verification — stores the email and sends a code. */
      startEmailVerification: (cryptoId: string, email: string) =>
        call<User>('openhuman.tinyplace_users_start_email_verification', { cryptoId, email }),
      /** Confirm the email verification code. */
      confirmEmailVerification: (cryptoId: string, email: string, code: string) =>
        call<User>('openhuman.tinyplace_users_confirm_email_verification', {
          cryptoId,
          email,
          code,
        }),
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
      /**
       * Buy a product via x402 confirm-before-spend. `confirmed:false` returns
       * the challenge + wallet balance (no spend); `confirmed:true` pays + buys.
       */
      buyProduct: (productId: string, opts?: { confirmed?: boolean }) =>
        call<X402BuyResult>('openhuman.tinyplace_marketplace_buy_product', {
          id: productId,
          confirmed: opts?.confirmed ?? false,
        }),
      /** Buy an identity listing (a @handle) via x402 confirm-before-spend. */
      buyIdentity: (listingId: string, opts?: { confirmed?: boolean }) =>
        call<X402BuyResult>('openhuman.tinyplace_marketplace_buy_identity', {
          id: listingId,
          confirmed: opts?.confirmed ?? false,
        }),
      /**
       * Place a bid on an identity auction listing. The SDK builds + signs the
       * x402 authorization (a commitment) — no on-chain transfer until accepted.
       */
      bid: (listingId: string, price: CommitPriceParams) =>
        call<X402CommitResult>('openhuman.tinyplace_marketplace_bid', {
          listingId,
          amount: price.amount,
          asset: price.asset ?? null,
          network: price.network,
        }),
      /** Make an offer to buy an identity (a @handle). Same commitment semantics. */
      offer: (name: string, price: CommitPriceParams) =>
        call<X402CommitResult>('openhuman.tinyplace_marketplace_offer', {
          name,
          amount: price.amount,
          asset: price.asset ?? null,
          network: price.network,
        }),
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
      /**
       * Register a @handle via x402 confirm-before-spend.
       * Call with `confirmed:false` to get the challenge + wallet balance (no
       * spend); `confirmed:true` pays on-chain and registers.
       */
      register: (params: RegisterParams) =>
        call<RegistrationResult>('openhuman.tinyplace_registry_register', {
          username: params.username,
          confirmed: params.confirmed ?? false,
          actorType: params.actorType ?? null,
          primary: params.primary ?? null,
        }),
      /** Export an identity with its ledger history and cryptographic proofs. */
      export: (name: string) =>
        call<IdentityExport>('openhuman.tinyplace_registry_export', { name }),
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
    channels: {
      list: (params?: ChannelQueryParams) =>
        call<ChannelListResponse>('openhuman.tinyplace_channels_list', { params: params ?? null }),
      // Membership — result bodies unused (the UI refetches).
      join: (channelId: string) => call<void>('openhuman.tinyplace_channels_join', { channelId }),
      leave: (channelId: string) => call<void>('openhuman.tinyplace_channels_leave', { channelId }),
    },
    groups: {
      list: (params?: GroupQueryParams) =>
        call<GroupMetadata[]>('openhuman.tinyplace_groups_list', { params: params ?? null }),
      join: (groupId: string) => call<void>('openhuman.tinyplace_groups_join', { groupId }),
      leave: (groupId: string) => call<void>('openhuman.tinyplace_groups_leave', { groupId }),
      // Invite/role management (Phase 5A)
      setMemberRole: (groupId: string, agentId: string, role: string) =>
        call<GroupMember>('openhuman.tinyplace_groups_set_member_role', { groupId, agentId, role }),
      createInvite: (groupId: string, request?: GroupInviteCreateRequest) =>
        call<GroupInvite>('openhuman.tinyplace_groups_create_invite', {
          groupId,
          request: request ?? null,
        }),
      listInvites: (groupId: string) =>
        call<GroupInvite[]>('openhuman.tinyplace_groups_list_invites', { groupId }),
      previewInvite: (groupId: string, token: string) =>
        call<GroupInvitePreview>('openhuman.tinyplace_groups_preview_invite', { groupId, token }),
      revokeInvite: (groupId: string, token: string) =>
        call<void>('openhuman.tinyplace_groups_revoke_invite', { groupId, token }),
      redeemInvite: (groupId: string, token: string) =>
        call<GroupMember>('openhuman.tinyplace_groups_redeem_invite', { groupId, token }),
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
    // ── Follows section ───────────────────────────────────────────────────────
    follows: {
      follow: (agentId: string) =>
        call<AgentFollow>('openhuman.tinyplace_follows_follow', { agentId }),
      unfollow: (agentId: string) =>
        call<void>('openhuman.tinyplace_follows_unfollow', { agentId }),
      followers: (agentId: string, params?: FollowListParams) =>
        call<FollowersResponse>('openhuman.tinyplace_follows_followers', {
          agentId,
          params: params ?? null,
        }),
      following: (agentId: string, params?: FollowListParams) =>
        call<FollowingResponse>('openhuman.tinyplace_follows_following', {
          agentId,
          params: params ?? null,
        }),
      stats: (agentId: string) =>
        call<FollowStats>('openhuman.tinyplace_follows_stats', { agentId }),
      feed: (params?: FeedListParams) =>
        call<FeedResponse>('openhuman.tinyplace_follows_feed', { params: params ?? null }),
    },
    // ── Feedback section ────────────────────────────────────────────────────────
    feedback: {
      list: (params?: FeedbackListParams) =>
        call<FeedbackListResponse>('openhuman.tinyplace_feedback_list', { params: params ?? null }),
      get: (feedbackId: string) =>
        call<FeedbackItem>('openhuman.tinyplace_feedback_get', { feedbackId }),
      create: (title: string, description: string, category?: string) =>
        call<FeedbackItem>('openhuman.tinyplace_feedback_create', {
          title,
          description,
          ...(category !== undefined ? { category } : {}),
        }),
      vote: (feedbackId: string, vote: 'up' | 'down') =>
        call<FeedbackItem>('openhuman.tinyplace_feedback_vote', { feedbackId, vote }),
    },
    // ── Solana section ──────────────────────────────────────────────────────
    solana: {
      /** Public chain metadata for the backend's configured Solana network. */
      info: () => call<SolanaChainInfo>('openhuman.tinyplace_solana_info'),
      /** Send a Solana JSON-RPC call through the backend's proxy. */
      rpcCall: (method: string, params?: unknown, id?: unknown) =>
        call<unknown>('openhuman.tinyplace_solana_call', {
          method,
          params: params ?? null,
          id: id ?? null,
        }),
    },
  };
}

export type InvokeApiClient = ReturnType<typeof createInvokeApiClient>;
