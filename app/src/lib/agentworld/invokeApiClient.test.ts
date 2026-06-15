/**
 * Unit tests for the Agent World invoke API client bridge.
 *
 * Mocks `callCoreRpc` and asserts:
 * 1. Each client method calls the correct `openhuman.tinyplace_*` RPC method.
 * 2. Parameters are marshalled correctly.
 * 3. A `PAYMENT_REQUIRED:` rejection becomes a `PaymentRequiredError`.
 * 4. Other errors propagate unchanged.
 */
import { beforeEach, describe, expect, type Mock, test, vi } from 'vitest';

import { callCoreRpc } from '../../services/coreRpcClient';
import { createInvokeApiClient, PaymentRequiredError } from './invokeApiClient';

vi.mock('../../services/coreRpcClient', () => ({ callCoreRpc: vi.fn() }));

const mockCallCoreRpc = callCoreRpc as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── directory.listAgents ──────────────────────────────────────────────────────

describe('directory.listAgents', () => {
  test('calls openhuman.tinyplace_directory_list_agents with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ agents: [] });
    const client = createInvokeApiClient();
    const params = { q: 'ai assistant', limit: 10 };
    await client.directory.listAgents(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_list_agents',
      params: { params },
    });
  });

  test('calls without params (null)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ agents: [] });
    const client = createInvokeApiClient();
    await client.directory.listAgents();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_list_agents',
      params: { params: null },
    });
  });

  test('returns the response from core', async () => {
    const mockResponse = { agents: [{ agentId: 'abc123', name: 'Test Agent' }] };
    mockCallCoreRpc.mockResolvedValueOnce(mockResponse);
    const client = createInvokeApiClient();
    const result = await client.directory.listAgents();
    expect(result).toEqual(mockResponse);
  });
});

// ── directory.getAgent ────────────────────────────────────────────────────────

describe('directory.getAgent', () => {
  test('calls openhuman.tinyplace_directory_get_agent with agentId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ agentId: 'abc123' });
    const client = createInvokeApiClient();
    await client.directory.getAgent('abc123');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_get_agent',
      params: { agentId: 'abc123' },
    });
  });
});

// ── explorer.overview ─────────────────────────────────────────────────────────

describe('explorer.overview', () => {
  test('calls openhuman.tinyplace_explorer_overview with no params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ totalAgents: 42 });
    const client = createInvokeApiClient();
    await client.explorer.overview();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_explorer_overview',
      params: undefined,
    });
  });
});

// ── search.unified ────────────────────────────────────────────────────────────

describe('search.unified', () => {
  test('calls openhuman.tinyplace_search_unified with query', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ results: [] });
    const client = createInvokeApiClient();
    await client.search.unified('coding assistant');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_search_unified',
      params: { query: 'coding assistant' },
    });
  });
});

// ── registry.get ─────────────────────────────────────────────────────────────

describe('registry.get', () => {
  test('calls openhuman.tinyplace_registry_get with name', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ available: true, name: '@atlas' });
    const client = createInvokeApiClient();
    await client.registry.get('@atlas');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_registry_get',
      params: { name: '@atlas' },
    });
  });

  test('returns availability response', async () => {
    const mockResponse = { available: false, name: '@taken', identity: { cryptoId: 'abc' } };
    mockCallCoreRpc.mockResolvedValueOnce(mockResponse);
    const client = createInvokeApiClient();
    const result = await client.registry.get('@taken');
    expect(result).toEqual(mockResponse);
  });
});

// ── marketplace.listIdentities ────────────────────────────────────────────────

describe('marketplace.listIdentities', () => {
  test('calls openhuman.tinyplace_marketplace_list_identities with status', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identities: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listIdentities({ status: 'active' });

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_identities',
      params: { limit: null, status: 'active' },
    });
  });

  test('calls without params (null values)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identities: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listIdentities();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_identities',
      params: { limit: null, status: null },
    });
  });
});

// ── marketplace.identityFloor ─────────────────────────────────────────────────

describe('marketplace.identityFloor', () => {
  test('calls openhuman.tinyplace_marketplace_identity_floor with length', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ length: 3, price: { amount: '250', asset: 'USDC' } });
    const client = createInvokeApiClient();
    await client.marketplace.identityFloor(3);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_identity_floor',
      params: { length: 3 },
    });
  });

  test('calls without length (null)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({});
    const client = createInvokeApiClient();
    await client.marketplace.identityFloor();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_identity_floor',
      params: { length: null },
    });
  });
});

// ── marketplace.recent ────────────────────────────────────────────────────────

describe('marketplace.recent', () => {
  test('calls openhuman.tinyplace_marketplace_recent with no params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ sales: [] });
    const client = createInvokeApiClient();
    await client.marketplace.recent();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_recent',
      params: undefined,
    });
  });
});

// ── marketplace.identitySaleHistory ──────────────────────────────────────────

describe('marketplace.identitySaleHistory', () => {
  test('calls openhuman.tinyplace_marketplace_identity_sale_history with name', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ history: [] });
    const client = createInvokeApiClient();
    await client.marketplace.identitySaleHistory('@atlas');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_identity_sale_history',
      params: { name: '@atlas' },
    });
  });
});

// ── marketplace.listBids ──────────────────────────────────────────────────────

describe('marketplace.listBids', () => {
  test('calls openhuman.tinyplace_marketplace_list_bids with listingId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ bids: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listBids('listing-123');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_bids',
      params: { listingId: 'listing-123' },
    });
  });
});

// ── marketplace.listOffers ────────────────────────────────────────────────────

describe('marketplace.listOffers', () => {
  test('calls openhuman.tinyplace_marketplace_list_offers with name filter', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ offers: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listOffers({ name: '@atlas' });

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_offers',
      params: { name: '@atlas', buyer: null },
    });
  });

  test('calls with buyer filter', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ offers: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listOffers({ buyer: '@buyer' });

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_offers',
      params: { name: null, buyer: '@buyer' },
    });
  });

  test('calls without filters (null values)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ offers: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listOffers();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_offers',
      params: { name: null, buyer: null },
    });
  });
});

// ── directoryIdentities.list ──────────────────────────────────────────────────

describe('directoryIdentities.list', () => {
  test('calls openhuman.tinyplace_directory_list_identities with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identities: [] });
    const client = createInvokeApiClient();
    const params = { limit: 20 };
    await client.directoryIdentities.list(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_list_identities',
      params: { params },
    });
  });

  test('calls without params (null)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identities: [] });
    const client = createInvokeApiClient();
    await client.directoryIdentities.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_list_identities',
      params: { params: null },
    });
  });
});

// ── PaymentRequiredError ──────────────────────────────────────────────────────

describe('PaymentRequiredError propagation', () => {
  test('402 string rejection becomes PaymentRequiredError', async () => {
    const challenge = { error: 'payment required', payment: { scheme: 'x402', amount: '0.01' } };
    mockCallCoreRpc.mockRejectedValueOnce(
      new Error(`PAYMENT_REQUIRED:${JSON.stringify(challenge)}`)
    );
    const client = createInvokeApiClient();
    await expect(client.explorer.overview()).rejects.toBeInstanceOf(PaymentRequiredError);
  });

  test('PaymentRequiredError.challenge contains the parsed challenge', async () => {
    const challenge = { error: 'payment required', payment: { scheme: 'x402', amount: '0.01' } };
    mockCallCoreRpc.mockRejectedValueOnce(
      new Error(`PAYMENT_REQUIRED:${JSON.stringify(challenge)}`)
    );
    const client = createInvokeApiClient();
    let caught: PaymentRequiredError | null = null;
    try {
      await client.search.unified('test');
    } catch (e) {
      caught = e as PaymentRequiredError;
    }
    expect(caught).toBeInstanceOf(PaymentRequiredError);
    expect(caught?.challenge).toEqual(challenge);
  });

  test('non-402 errors propagate unchanged', async () => {
    const networkErr = new Error('network failure');
    mockCallCoreRpc.mockRejectedValueOnce(networkErr);
    const client = createInvokeApiClient();
    await expect(client.directory.listAgents()).rejects.toBe(networkErr);
  });
});
