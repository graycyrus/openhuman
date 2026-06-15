/**
 * ProfilesSection — Agent World Profiles section.
 *
 * Ported from website/src/components/explore/Profiles.tsx.
 * Uses the invoke API client bridge (directory.listAgents) to load agent cards
 * from the tiny.place backend via the OpenHuman core RPC layer.
 *
 * Renders the first agent's profile card with:
 *   - Avatar initials, handle, cryptoId, bio
 *   - Skills / tags chips
 *   - Join date
 */
import { useEffect, useState } from 'react';

import { type AgentCard, PaymentRequiredError } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';

// ── Utility helpers ────────────────────────────────────────────────────────────

function truncateCryptoId(cryptoId: string): string {
  if (cryptoId.length <= 12) return cryptoId;
  return `${cryptoId.slice(0, 6)}…${cryptoId.slice(-4)}`;
}

function formatHandle(agent: AgentCard): string {
  const name =
    (agent['username'] as string | undefined) ?? (agent.name as string | undefined) ?? '';
  return `@${name}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Normalize a skill/tag value that may be a string or an `{ id, name }` object. */
function toLabel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['name'] === 'string') return obj['name'];
    if (typeof obj['id'] === 'string') return obj['id'];
  }
  return String(value);
}

// ── State type ─────────────────────────────────────────────────────────────────

type AgentsState =
  | { status: 'loading' }
  | { status: 'payment_required'; challenge: unknown }
  | { status: 'error'; message: string }
  | { status: 'ok'; agents: AgentCard[] };

// ── Data hook ─────────────────────────────────────────────────────────────────

function useAgents(): AgentsState {
  const [state, setState] = useState<AgentsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void apiClient.directory
      .listAgents()
      .then(data => {
        if (!cancelled) setState({ status: 'ok', agents: data.agents ?? [] });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PaymentRequiredError) {
          setState({ status: 'payment_required', challenge: err.challenge });
        } else {
          setState({ status: 'error', message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentProfileCard({ agent }: { agent: AgentCard }) {
  const handle = formatHandle(agent);
  const cryptoId = (agent['cryptoId'] as string | undefined) ?? '';
  const bio = (agent.description as string | undefined) ?? '';
  const createdAt = (agent['createdAt'] as string | undefined) ?? '';
  const agentName = (agent.name as string | undefined) ?? handle.slice(1) ?? '?';
  const initials = agentName.slice(0, 2).toUpperCase();

  const rawSkills =
    (agent['skills'] as unknown[] | undefined) ?? (agent['tags'] as unknown[] | undefined) ?? [];
  const skills = rawSkills.map(toLabel);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ocean text-lg font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white hover:underline cursor-default">
            {handle}
          </h3>
          {cryptoId && (
            <p className="mt-0.5 font-mono text-xs text-neutral-500" title={cryptoId}>
              {truncateCryptoId(cryptoId)}
            </p>
          )}
          {bio && <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{bio}</p>}
        </div>
      </div>

      {skills.length > 0 && (
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <h4 className="mb-2 text-xs font-medium text-white">Skills</h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.map(skill => (
              <span
                key={skill}
                className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {createdAt && (
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <span className="text-xs text-neutral-500">Joined {formatDate(createdAt)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ProfilesSection() {
  const state = useAgents();

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <span className="animate-pulse text-sm">Loading profile...</span>
      </div>
    );
  }

  if (state.status === 'payment_required') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-amber-400">
        <p className="text-lg font-medium">Access requires payment</p>
        <p className="text-sm text-neutral-400">
          Your wallet will be used to fulfill the x402 payment challenge.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    const isWalletLocked =
      state.message.includes('wallet is not configured') ||
      state.message.includes('wallet secret material is missing');

    if (isWalletLocked) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-neutral-400">
          <p className="text-lg font-medium">Unlock your wallet to use Agent World</p>
          <p className="text-sm">
            Agent World uses your wallet identity. Import your recovery phrase in Settings to
            continue.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-red-400">
        <p className="font-medium">Failed to load profile: {state.message}</p>
      </div>
    );
  }

  // status === 'ok'
  const agents = state.agents;

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        <span className="text-sm">No agents found.</span>
      </div>
    );
  }

  // Render profile card for the first agent (mirrors Profiles.tsx behaviour)
  const agent = agents[0];

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Profiles</h2>
      <AgentProfileCard agent={agent} />
    </div>
  );
}
