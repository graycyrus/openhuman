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

// ── marketplace.browseMarketplace ─────────────────────────────────────────────

describe('marketplace.browseMarketplace', () => {
  test('calls openhuman.tinyplace_marketplace_browse with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ products: [] });
    const client = createInvokeApiClient();
    const params = { q: 'model', category: 'ai' };
    await client.marketplace.browseMarketplace(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_browse',
      params: { params },
    });
  });

  test('calls with null when no params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ products: [] });
    const client = createInvokeApiClient();
    await client.marketplace.browseMarketplace();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_browse',
      params: { params: null },
    });
  });
});

// ── marketplace.listProducts ──────────────────────────────────────────────────

describe('marketplace.listProducts', () => {
  test('calls openhuman.tinyplace_marketplace_list_products', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ products: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listProducts({ limit: 10 });

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_products',
      params: { params: { limit: 10 } },
    });
  });

  test('calls with null params when omitted', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ products: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listProducts();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_products',
      params: { params: null },
    });
  });
});

// ── marketplace.getProduct ────────────────────────────────────────────────────

describe('marketplace.getProduct', () => {
  test('calls openhuman.tinyplace_marketplace_get_product with productId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ productId: 'prod_abc' });
    const client = createInvokeApiClient();
    await client.marketplace.getProduct('prod_abc');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_get_product',
      params: { productId: 'prod_abc' },
    });
  });
});

// ── marketplace.categories ────────────────────────────────────────────────────

describe('marketplace.categories', () => {
  test('calls openhuman.tinyplace_marketplace_categories with no params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ categories: [] });
    const client = createInvokeApiClient();
    await client.marketplace.categories();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_categories',
      params: undefined,
    });
  });
});

// ── marketplace.featured ──────────────────────────────────────────────────────

describe('marketplace.featured', () => {
  test('calls openhuman.tinyplace_marketplace_featured with no params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ items: [] });
    const client = createInvokeApiClient();
    await client.marketplace.featured();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_featured',
      params: undefined,
    });
  });
});

// ── marketplace.listProductReviews ────────────────────────────────────────────

describe('marketplace.listProductReviews', () => {
  test('calls openhuman.tinyplace_marketplace_list_product_reviews with productId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ reviews: [] });
    const client = createInvokeApiClient();
    await client.marketplace.listProductReviews('prod_xyz');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_marketplace_list_product_reviews',
      params: { productId: 'prod_xyz' },
    });
  });
});

// ── artifacts.list ────────────────────────────────────────────────────────────

describe('artifacts.list', () => {
  test('calls openhuman.tinyplace_artifacts_list with params and actorId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ artifacts: [] });
    const client = createInvokeApiClient();
    await client.artifacts.list({ role: 'owner' }, 'agent123');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_artifacts_list',
      params: { params: { role: 'owner' }, actorId: 'agent123' },
    });
  });

  test('calls with null params when omitted', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ artifacts: [] });
    const client = createInvokeApiClient();
    await client.artifacts.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_artifacts_list',
      params: { params: null },
    });
  });
});

// ── artifacts.get ─────────────────────────────────────────────────────────────

describe('artifacts.get', () => {
  test('calls openhuman.tinyplace_artifacts_get with artifactId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ artifactId: 'art_abc', owner: 'agent123' });
    const client = createInvokeApiClient();
    await client.artifacts.get('art_abc');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_artifacts_get',
      params: { artifactId: 'art_abc' },
    });
  });

  test('passes actorId when provided', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ artifactId: 'art_abc', owner: 'agent123' });
    const client = createInvokeApiClient();
    await client.artifacts.get('art_abc', 'agent456');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_artifacts_get',
      params: { artifactId: 'art_abc', actorId: 'agent456' },
    });
  });
});

// ── escrow.list ───────────────────────────────────────────────────────────────

describe('escrow.list', () => {
  test('calls openhuman.tinyplace_escrow_list with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ escrows: [] });
    const client = createInvokeApiClient();
    await client.escrow.list({ status: 'funded' });

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_escrow_list',
      params: { params: { status: 'funded' } },
    });
  });

  test('calls with null params when omitted', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ escrows: [] });
    const client = createInvokeApiClient();
    await client.escrow.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_escrow_list',
      params: { params: null },
    });
  });
});

// ── escrow.get ────────────────────────────────────────────────────────────────

describe('escrow.get', () => {
  test('calls openhuman.tinyplace_escrow_get with escrowId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ escrowId: 'esc_abc', status: 'funded' });
    const client = createInvokeApiClient();
    await client.escrow.get('esc_abc');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_escrow_get',
      params: { escrowId: 'esc_abc' },
    });
  });
});

// ── jobs.list ─────────────────────────────────────────────────────────────────

describe('jobs.list', () => {
  test('calls openhuman.tinyplace_jobs_list with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ jobs: [] });
    const client = createInvokeApiClient();
    await client.jobs.list({ q: 'rust developer' });

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_jobs_list',
      params: { params: { q: 'rust developer' } },
    });
  });

  test('calls with null params when omitted', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ jobs: [] });
    const client = createInvokeApiClient();
    await client.jobs.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_jobs_list',
      params: { params: null },
    });
  });
});

// ── jobs.get ──────────────────────────────────────────────────────────────────

describe('jobs.get', () => {
  test('calls openhuman.tinyplace_jobs_get with jobId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ jobId: 'job_abc', status: 'open' });
    const client = createInvokeApiClient();
    await client.jobs.get('job_abc');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_jobs_get',
      params: { jobId: 'job_abc' },
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
