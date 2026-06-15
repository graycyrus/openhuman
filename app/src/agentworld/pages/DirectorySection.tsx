/**
 * DirectorySection — Agent World Directory section.
 *
 * Ported from tiny.place `website/src/components/explore/Directory.tsx` and
 * `website/src/hooks/use-directory.ts`. Adapted to call `apiClient` directly
 * (no HTTP SDK / no ApiProvider context needed) following the same pattern as
 * ExploreSection.tsx.
 *
 * Shows a browsable grid of agents registered in the tiny.place directory.
 * Each card displays the agent's handle, description, and skills/tags.
 */
import debugFactory from 'debug';
import { useEffect, useState } from 'react';

import {
  type AgentCard,
  type ListAgentsResponse,
  PaymentRequiredError,
} from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';

const debug = debugFactory('agentworld:directory');

// ── Helpers (ported from Directory.tsx) ──────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-pink-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-cyan-600',
  'bg-rose-600',
  'bg-violet-600',
  'bg-indigo-600',
  'bg-teal-600',
];

function getAvatarColor(agentId: string): string {
  let total = 0;
  for (let i = 0; i < agentId.length; i++) {
    total += agentId.charCodeAt(i);
  }
  return AVATAR_COLORS[total % AVATAR_COLORS.length] ?? 'bg-blue-600';
}

function getDisplayName(agent: AgentCard): string {
  const username = agent['username'] as string | undefined;
  return username ?? agent.name ?? agent.agentId.slice(0, 8);
}

function getHandle(agent: AgentCard): string {
  return '@' + getDisplayName(agent);
}

function getInitials(agent: AgentCard): string {
  return getDisplayName(agent).slice(0, 2).toUpperCase();
}

function getSkills(agent: AgentCard): string[] {
  const skills = agent['skills'] as unknown[] | undefined;
  const tags = agent['tags'] as unknown[] | undefined;
  const raw = skills ?? tags ?? [];
  // Backend may return strings or { id, name } objects — normalise to string.
  return raw.map(s => {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object' && 'name' in s) return String((s as { name: unknown }).name);
    return String(s);
  });
}

// ── State machine ─────────────────────────────────────────────────────────────

type State =
  | { status: 'loading' }
  | { status: 'payment_required'; challenge: unknown }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: ListAgentsResponse };

function useDirectoryAgents(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    debug('fetching directory agents');

    void apiClient.directory
      .listAgents()
      .then(data => {
        if (cancelled) return;
        debug('[tinyplace][ui] DirectorySection: loaded %d agents', data.agents.length);
        setState({ status: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PaymentRequiredError) {
          debug('[tinyplace][ui] DirectorySection: 402 payment_required');
          setState({ status: 'payment_required', challenge: err.challenge });
        } else {
          debug('[tinyplace][ui] DirectorySection: error: %s', String(err));
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

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border border-gray-800 bg-gray-950 p-3">
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-800" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-20 rounded bg-gray-800" />
              <div className="h-3 w-full rounded bg-gray-800" />
              <div className="flex gap-1">
                <div className="h-4 w-12 rounded-full bg-gray-800" />
                <div className="h-4 w-14 rounded-full bg-gray-800" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentCardItem({ agent }: { agent: AgentCard }) {
  const [selected, setSelected] = useState(false);
  const handle = getHandle(agent);
  const skills = getSkills(agent);

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'rounded-lg border p-3 text-left transition-colors cursor-pointer',
        selected ? 'border-ocean bg-gray-900' : 'border-gray-800 bg-gray-950 hover:border-gray-700',
      ].join(' ')}
      onClick={() => setSelected(s => !s)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelected(s => !s);
        }
      }}>
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0">
          <div
            className={`${getAvatarColor(agent.agentId)} flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white`}>
            {getInitials(agent)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{handle}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{agent.description ?? ''}</p>
          {skills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {skills.map(skill => (
                <span
                  key={skill}
                  className="rounded-full bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DirectorySection() {
  const state = useDirectoryAgents();

  if (state.status === 'loading') {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Directory</h2>
        <LoadingSkeleton />
      </div>
    );
  }

  if (state.status === 'payment_required') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-amber-400">
        <p className="text-lg font-medium">Access requires payment</p>
        <p className="text-sm text-gray-400">
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
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
          <p className="text-lg font-medium">Unlock your wallet to browse the Directory</p>
          <p className="text-sm">
            Agent World uses your wallet identity. Import your recovery phrase in Settings to
            continue.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-red-400">
        <p className="font-medium">Failed to load Directory</p>
        <p className="text-sm text-gray-500">{state.message}</p>
      </div>
    );
  }

  // state.status === 'ok'
  const agents = state.data.agents ?? [];

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-500">
        <p className="text-sm">No agents found in the directory.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Directory</h2>
      <div className="grid grid-cols-2 gap-3">
        {agents.map(agent => (
          <AgentCardItem key={agent.agentId} agent={agent} />
        ))}
      </div>
    </div>
  );
}
