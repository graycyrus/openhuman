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

// ── Messaging section — channels.list ─────────────────────────────────────────

describe('channels.list', () => {
  test('calls openhuman.tinyplace_channels_list with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ channels: [] });
    const client = createInvokeApiClient();
    const params = { q: 'defi', limit: 10 };
    await client.channels.list(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_channels_list',
      params: { params },
    });
  });

  test('calls with null when no params provided', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ channels: [] });
    const client = createInvokeApiClient();
    await client.channels.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_channels_list',
      params: { params: null },
    });
  });

  test('returns channel list response from core', async () => {
    const mockResponse = {
      channels: [{ channelId: 'ch1', name: 'General', memberCount: 42, isPublic: true }],
    };
    mockCallCoreRpc.mockResolvedValueOnce(mockResponse);
    const client = createInvokeApiClient();
    const result = await client.channels.list();
    expect(result).toEqual(mockResponse);
  });
});

// ── Messaging section — groups.list ──────────────────────────────────────────

describe('groups.list', () => {
  test('calls openhuman.tinyplace_groups_list with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce([]);
    const client = createInvokeApiClient();
    const params = { q: 'research', limit: 5 };
    await client.groups.list(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_groups_list',
      params: { params },
    });
  });

  test('calls with null when no params provided', async () => {
    mockCallCoreRpc.mockResolvedValueOnce([]);
    const client = createInvokeApiClient();
    await client.groups.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_groups_list',
      params: { params: null },
    });
  });
});

// ── Messaging section — broadcasts.list ──────────────────────────────────────

describe('broadcasts.list', () => {
  test('calls openhuman.tinyplace_broadcasts_list with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce([]);
    const client = createInvokeApiClient();
    const params = { visibility: 'public', limit: 20 };
    await client.broadcasts.list(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_broadcasts_list',
      params: { params },
    });
  });

  test('calls with null when no params provided', async () => {
    mockCallCoreRpc.mockResolvedValueOnce([]);
    const client = createInvokeApiClient();
    await client.broadcasts.list();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_broadcasts_list',
      params: { params: null },
    });
  });
});

// ── Messaging section — inbox.list ────────────────────────────────────────────

describe('inbox.list', () => {
  test('calls openhuman.tinyplace_inbox_list with params and no owner', async () => {
    const mockResult = { items: [], unreadCount: 0, totalCount: 0, cursor: null };
    mockCallCoreRpc.mockResolvedValueOnce(mockResult);
    const client = createInvokeApiClient();
    const params = { limit: 30 };
    await client.inbox.list(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_inbox_list',
      params: { params, owner: null },
    });
  });

  test('passes owner when provided', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ items: [], unreadCount: 0, totalCount: 0 });
    const client = createInvokeApiClient();
    await client.inbox.list(undefined, 'agent-xyz');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_inbox_list',
      params: { params: null, owner: 'agent-xyz' },
    });
  });

  test('returns inbox list result from core', async () => {
    const mockResult = {
      items: [
        {
          itemId: 'i1',
          type: 'SYSTEM',
          status: 'unread',
          priority: 'normal',
          timestamp: '2024-01-01T00:00:00Z',
          subject: 'Hello',
        },
      ],
      unreadCount: 1,
      totalCount: 1,
    };
    mockCallCoreRpc.mockResolvedValueOnce(mockResult);
    const client = createInvokeApiClient();
    const result = await client.inbox.list();
    expect(result).toEqual(mockResult);
  });
});

// ── Messaging section — inbox.counts ─────────────────────────────────────────

describe('inbox.counts', () => {
  test('calls openhuman.tinyplace_inbox_counts with no owner', async () => {
    const mockCounts = { unread: 3, read: 10, archived: 2, byType: {}, urgent: 0 };
    mockCallCoreRpc.mockResolvedValueOnce(mockCounts);
    const client = createInvokeApiClient();
    await client.inbox.counts();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_inbox_counts',
      params: { owner: null },
    });
  });

  test('passes owner when provided', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({
      unread: 0,
      read: 0,
      archived: 0,
      byType: {},
      urgent: 0,
    });
    const client = createInvokeApiClient();
    await client.inbox.counts('agent-abc');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_inbox_counts',
      params: { owner: 'agent-abc' },
    });
  });

  test('returns counts from core', async () => {
    const mockCounts = { unread: 5, read: 20, archived: 3, byType: { SYSTEM: 2 }, urgent: 1 };
    mockCallCoreRpc.mockResolvedValueOnce(mockCounts);
    const client = createInvokeApiClient();
    const result = await client.inbox.counts();
    expect(result).toEqual(mockCounts);
  });
});
