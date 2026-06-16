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

// ── directory.resolve ─────────────────────────────────────────────────────────

describe('directory.resolve', () => {
  test('calls openhuman.tinyplace_directory_resolve with name', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identity: null, agent: null });
    const client = createInvokeApiClient();
    await client.directory.resolve('alice.agent');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_resolve',
      params: { name: 'alice.agent' },
    });
  });

  test('returns the ResolveResponse from core', async () => {
    const mockResponse = { identity: { name: 'alice.agent' }, agent: null };
    mockCallCoreRpc.mockResolvedValueOnce(mockResponse);
    const client = createInvokeApiClient();
    const result = await client.directory.resolve('alice.agent');
    expect(result).toEqual(mockResponse);
  });
});

// ── directory.reverse ─────────────────────────────────────────────────────────

describe('directory.reverse', () => {
  test('calls openhuman.tinyplace_directory_reverse with cryptoId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ cryptoId: 'abc123', identities: [] });
    const client = createInvokeApiClient();
    await client.directory.reverse('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_reverse',
      params: { cryptoId: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk' },
    });
  });
});

// ── directory.listIdentities ──────────────────────────────────────────────────

describe('directory.listIdentities', () => {
  test('calls openhuman.tinyplace_directory_list_identities with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identities: [] });
    const client = createInvokeApiClient();
    const params = { q: 'alice', limit: 5 };
    await client.directory.listIdentities(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_list_identities',
      params: { params },
    });
  });

  test('calls without params (null)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ identities: [] });
    const client = createInvokeApiClient();
    await client.directory.listIdentities();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_list_identities',
      params: { params: null },
    });
  });
});

// ── directory.skills ──────────────────────────────────────────────────────────

describe('directory.skills', () => {
  test('calls openhuman.tinyplace_directory_skills with params', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ agents: [] });
    const client = createInvokeApiClient();
    const params = { q: 'coding', limit: 10 };
    await client.directory.skills(params);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_skills',
      params: { params },
    });
  });

  test('calls without params (null)', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ agents: [] });
    const client = createInvokeApiClient();
    await client.directory.skills();

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_directory_skills',
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

// ── profiles.get ─────────────────────────────────────────────────────────────

describe('profiles.get', () => {
  test('calls openhuman.tinyplace_profiles_get with username', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ username: 'alice', name: 'Alice' });
    const client = createInvokeApiClient();
    await client.profiles.get('alice');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_profiles_get',
      params: { username: 'alice' },
    });
  });

  test('returns the AgentProfile from core', async () => {
    const profile = { username: 'bob', name: 'Bob', cryptoId: 'abc123' };
    mockCallCoreRpc.mockResolvedValueOnce(profile);
    const client = createInvokeApiClient();
    const result = await client.profiles.get('bob');
    expect(result).toEqual(profile);
  });
});

// ── profiles.activity ─────────────────────────────────────────────────────────

describe('profiles.activity', () => {
  test('calls openhuman.tinyplace_profiles_activity with username', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ events: [] });
    const client = createInvokeApiClient();
    await client.profiles.activity('alice');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_profiles_activity',
      params: { username: 'alice' },
    });
  });
});

// ── profiles.groups ───────────────────────────────────────────────────────────

describe('profiles.groups', () => {
  test('calls openhuman.tinyplace_profiles_groups with username', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ groups: [] });
    const client = createInvokeApiClient();
    await client.profiles.groups('alice');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_profiles_groups',
      params: { username: 'alice' },
    });
  });

  test('returns groups response', async () => {
    const resp = { groups: [{ groupId: 'g1', name: 'Devs' }] };
    mockCallCoreRpc.mockResolvedValueOnce(resp);
    const client = createInvokeApiClient();
    const result = await client.profiles.groups('alice');
    expect(result).toEqual(resp);
  });
});

// ── profiles.broadcasts ───────────────────────────────────────────────────────

describe('profiles.broadcasts', () => {
  test('calls openhuman.tinyplace_profiles_broadcasts with username', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ broadcasts: [] });
    const client = createInvokeApiClient();
    await client.profiles.broadcasts('alice');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_profiles_broadcasts',
      params: { username: 'alice' },
    });
  });
});

// ── profiles.attestations ─────────────────────────────────────────────────────

describe('profiles.attestations', () => {
  test('calls openhuman.tinyplace_profiles_attestations with username', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ attestations: [] });
    const client = createInvokeApiClient();
    await client.profiles.attestations('alice');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_profiles_attestations',
      params: { username: 'alice' },
    });
  });
});

// ── profiles.agentCard ────────────────────────────────────────────────────────

describe('profiles.agentCard', () => {
  test('calls openhuman.tinyplace_profiles_agent_card with username', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ agentId: 'abc123', name: 'Alice Agent' });
    const client = createInvokeApiClient();
    await client.profiles.agentCard('alice');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_profiles_agent_card',
      params: { username: 'alice' },
    });
  });
});

// ── users.get ─────────────────────────────────────────────────────────────────

describe('users.get', () => {
  test('calls openhuman.tinyplace_users_get with cryptoId', async () => {
    mockCallCoreRpc.mockResolvedValueOnce({ cryptoId: 'xyz789', displayName: 'Alice' });
    const client = createInvokeApiClient();
    await client.users.get('xyz789');

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_users_get',
      params: { cryptoId: 'xyz789' },
    });
  });

  test('returns User from core', async () => {
    const user = { cryptoId: 'xyz789', displayName: 'Alice', bio: 'Hello' };
    mockCallCoreRpc.mockResolvedValueOnce(user);
    const client = createInvokeApiClient();
    const result = await client.users.get('xyz789');
    expect(result).toEqual(user);
  });
});

// ── users.updateProfile ───────────────────────────────────────────────────────

describe('users.updateProfile', () => {
  test('calls openhuman.tinyplace_users_update_profile with cryptoId and update', async () => {
    const updated = { cryptoId: 'xyz789', displayName: 'Alice Updated' };
    mockCallCoreRpc.mockResolvedValueOnce(updated);
    const client = createInvokeApiClient();
    const update = { displayName: 'Alice Updated', bio: 'New bio' };
    await client.users.updateProfile('xyz789', update);

    expect(mockCallCoreRpc).toHaveBeenCalledWith({
      method: 'openhuman.tinyplace_users_update_profile',
      params: { cryptoId: 'xyz789', update },
    });
  });

  test('returns updated User from core', async () => {
    const updated = { cryptoId: 'xyz789', displayName: 'Alice Updated', bio: 'New bio' };
    mockCallCoreRpc.mockResolvedValueOnce(updated);
    const client = createInvokeApiClient();
    const result = await client.users.updateProfile('xyz789', { displayName: 'Alice Updated' });
    expect(result).toEqual(updated);
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
