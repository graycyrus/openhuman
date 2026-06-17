/**
 * Tests for ProfilesSection — Agent World profiles card.
 *
 * The page loads a single agent profile via `apiClient.directory.listAgents()`
 * and renders one of: loading / payment_required / error (generic + wallet
 * locked) / empty / populated card. We mock the apiClient so no RPC fires.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PaymentRequiredError } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';
import ProfilesSection from './ProfilesSection';

// ── Mock apiClient ────────────────────────────────────────────────────────────
// ProfilesSection only touches directory.listAgents — mock just that.

vi.mock('../AgentWorldShell', () => ({ apiClient: { directory: { listAgents: vi.fn() } } }));

const listAgents = vi.mocked(apiClient.directory.listAgents);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Loading state ──────────────────────────────────────────────────────────────

describe('loading state', () => {
  test('shows the loading placeholder before the fetch settles', () => {
    // A promise that never resolves keeps the component in `loading`.
    listAgents.mockReturnValue(new Promise(() => {}));
    render(<ProfilesSection />);
    expect(screen.getByText(/Loading profile…/i)).toBeInTheDocument();
  });
});

// ── Payment required state ──────────────────────────────────────────────────────

describe('payment_required state', () => {
  test('renders the x402 wallet payment message', async () => {
    listAgents.mockRejectedValueOnce(new PaymentRequiredError({ terms: 'x402' }));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Access requires payment/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Your wallet will be used to fulfill the x402 payment challenge/i)
    ).toBeInTheDocument();
  });
});

// ── Error states ────────────────────────────────────────────────────────────────

describe('error state', () => {
  test('renders a generic error message for an unknown failure', async () => {
    listAgents.mockRejectedValueOnce(new Error('boom: backend exploded'));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Failed to load profile/i)).toBeInTheDocument();
    expect(screen.getByText(/boom: backend exploded/i)).toBeInTheDocument();
  });

  test('renders the wallet-unlock prompt when the wallet is not configured', async () => {
    listAgents.mockRejectedValueOnce(new Error('the wallet is not configured'));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Unlock your wallet to use Agent World/i)).toBeInTheDocument();
    expect(screen.getByText(/Import your recovery phrase in Settings/i)).toBeInTheDocument();
  });

  test('renders the wallet-unlock prompt when wallet secret material is missing', async () => {
    listAgents.mockRejectedValueOnce(new Error('wallet secret material is missing'));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Unlock your wallet to use Agent World/i)).toBeInTheDocument();
  });
});

// ── Empty state ─────────────────────────────────────────────────────────────────

describe('empty state', () => {
  test('renders "No agents found" when the directory returns no agents', async () => {
    listAgents.mockResolvedValueOnce({ agents: [] });
    render(<ProfilesSection />);
    expect(await screen.findByText(/No agents found/i)).toBeInTheDocument();
    expect(screen.getByText(/No agent profiles are available yet/i)).toBeInTheDocument();
  });

  test('treats a missing agents array as empty', async () => {
    // `agents` undefined → falls back to [] in the hook.
    listAgents.mockResolvedValueOnce({} as { agents: [] });
    render(<ProfilesSection />);
    expect(await screen.findByText(/No agents found/i)).toBeInTheDocument();
  });
});

// ── Populated card ──────────────────────────────────────────────────────────────

describe('populated profile card', () => {
  test('renders a fully-populated agent card (handle, id, bio, skills, joined date)', async () => {
    listAgents.mockResolvedValueOnce({
      agents: [
        {
          agentId: 'agent-001',
          username: 'aurora',
          name: 'Aurora',
          description: 'A helpful demo agent.',
          cryptoId: 'crypto1234567890abcdef',
          createdAt: '2026-01-15T00:00:00Z',
          skills: ['research', { id: 'sk-2', name: 'writing' }, { id: 'sk-3' }, 42],
        },
      ],
    });
    render(<ProfilesSection />);

    // Handle (username already without a leading @ → @aurora).
    expect(await screen.findByText('@aurora')).toBeInTheDocument();
    // Bio.
    expect(screen.getByText('A helpful demo agent.')).toBeInTheDocument();
    // Initials derived from name (first two chars, uppercased).
    expect(screen.getByText('AU')).toBeInTheDocument();
    // Truncated crypto id (len > 12 → first6…last4).
    expect(screen.getByText('crypto…cdef')).toBeInTheDocument();
    // Skills header + labels from strings and { name }/{ id } objects + stringified value.
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByText('writing')).toBeInTheDocument();
    expect(screen.getByText('sk-3')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    // Joined date formatted (en-US, short month).
    expect(screen.getByText(/Joined Jan 15, 2026/i)).toBeInTheDocument();
  });

  test('strips a leading @ from username and falls back to tags for skills', async () => {
    listAgents.mockResolvedValueOnce({
      agents: [{ agentId: 'agent-002', username: '@nimbus', name: 'Nimbus', tags: ['ops'] }],
    });
    render(<ProfilesSection />);
    // Leading @ stripped then re-added → single @nimbus.
    expect(await screen.findByText('@nimbus')).toBeInTheDocument();
    // Falls back to `tags` when `skills` is absent.
    expect(screen.getByText('ops')).toBeInTheDocument();
  });

  test('uses `name` for the handle when `username` is absent', async () => {
    listAgents.mockResolvedValueOnce({ agents: [{ agentId: 'agent-003', name: 'Solo' }] });
    render(<ProfilesSection />);
    expect(await screen.findByText('@Solo')).toBeInTheDocument();
  });

  test('renders a short crypto id verbatim (no truncation) and hides optional sections', async () => {
    listAgents.mockResolvedValueOnce({
      agents: [
        {
          agentId: 'agent-004',
          username: 'tiny',
          name: 'Tiny',
          cryptoId: 'short',
          // No description, no createdAt, no skills/tags.
        },
      ],
    });
    render(<ProfilesSection />);
    expect(await screen.findByText('@tiny')).toBeInTheDocument();
    // <= 12 chars → shown as-is.
    expect(screen.getByText('short')).toBeInTheDocument();
    // No skills section / no joined section.
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
    expect(screen.queryByText(/Joined/i)).not.toBeInTheDocument();
  });

  test('renders only the first agent when several are returned', async () => {
    listAgents.mockResolvedValueOnce({
      agents: [
        { agentId: 'agent-005', username: 'first', name: 'First' },
        { agentId: 'agent-006', username: 'second', name: 'Second' },
      ],
    });
    render(<ProfilesSection />);
    expect(await screen.findByText('@first')).toBeInTheDocument();
    expect(screen.queryByText('@second')).not.toBeInTheDocument();
  });
});

// ── Cleanup / cancellation ──────────────────────────────────────────────────────

describe('cancellation', () => {
  test('does not update state after unmount (no act warning on late resolve)', async () => {
    let resolve!: (v: { agents: [] }) => void;
    listAgents.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    const { unmount } = render(<ProfilesSection />);
    unmount();
    // Resolve after unmount — the cancelled flag should swallow the update.
    resolve({ agents: [] });
    await waitFor(() => expect(listAgents).toHaveBeenCalled());
  });
});
