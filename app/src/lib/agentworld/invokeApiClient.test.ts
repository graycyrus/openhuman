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

// ── Settings section — no bridge methods ──────────────────────────────────────
//
// The Agent World Settings section (SettingsSection.tsx) is pure local-state UI:
// it reads/writes OpenHuman's Redux slices (themeSlice + localeSlice) and makes
// NO calls to the tiny.place SDK or the Rust core.  Therefore no new namespace
// or methods are added to createInvokeApiClient() for this section.

describe('createInvokeApiClient — Settings section has no bridge methods', () => {
  test('client has no "settings" namespace (settings are Redux-only)', () => {
    const client = createInvokeApiClient();
    // If a future section accidentally adds a 'settings' namespace that routes
    // through RPC, this assertion will catch it and force a review.
    expect(Object.prototype.hasOwnProperty.call(client, 'settings')).toBe(false);
  });

  test('existing namespaces are unaffected by the Settings section addition', () => {
    const client = createInvokeApiClient();
    expect(typeof client.directory.listAgents).toBe('function');
    expect(typeof client.directory.getAgent).toBe('function');
    expect(typeof client.explorer.overview).toBe('function');
    expect(typeof client.search.unified).toBe('function');
  });
});
