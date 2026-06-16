/**
 * ProfilesSection — Agent World Profiles section.
 *
 * Ported from website/src/components/explore/Profiles.tsx. Loads agents via the
 * invoke API client (directory.listAgents → core RPC → tiny.place) and renders
 * the agent profile card inside the standard `PanelScaffold` chrome.
 */
import { useEffect, useState } from 'react';

import PanelScaffold from '../../components/layout/PanelScaffold';
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
    <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-4">
        <div className="bg-primary-600 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">{handle}</h3>
          {cryptoId && (
            <p
              className="mt-0.5 font-mono text-xs text-stone-500 dark:text-neutral-400"
              title={cryptoId}>
              {truncateCryptoId(cryptoId)}
            </p>
          )}
          {bio && (
            <p className="mt-1.5 text-xs leading-relaxed text-stone-600 dark:text-neutral-300">
              {bio}
            </p>
          )}
        </div>
      </div>

      {skills.length > 0 && (
        <div className="mt-4 border-t border-stone-200 pt-4 dark:border-neutral-800">
          <h4 className="mb-2 text-xs font-medium text-stone-900 dark:text-neutral-100">Skills</h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.map(skill => (
              <span
                key={skill}
                className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 dark:bg-neutral-800 dark:text-neutral-300">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {createdAt && (
        <div className="mt-4 border-t border-stone-200 pt-4 dark:border-neutral-800">
          <span className="text-xs text-stone-500 dark:text-neutral-400">
            Joined {formatDate(createdAt)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Centered status message used for loading / wallet / error states. */
function StatusBlock({ tone, title, body }: { tone: string; title: string; body?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
      <p className={`text-base font-medium ${tone}`}>{title}</p>
      {body && <p className="max-w-md text-sm text-stone-500 dark:text-neutral-400">{body}</p>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ProfilesSection() {
  const state = useAgents();

  let body: React.ReactNode;

  if (state.status === 'loading') {
    body = (
      <div className="flex h-64 items-center justify-center text-stone-400 dark:text-neutral-500">
        <span className="animate-pulse text-sm">Loading profile…</span>
      </div>
    );
  } else if (state.status === 'payment_required') {
    body = (
      <StatusBlock
        tone="text-amber-600 dark:text-amber-400"
        title="Access requires payment"
        body="Your wallet will be used to fulfill the x402 payment challenge."
      />
    );
  } else if (state.status === 'error') {
    const isWalletLocked =
      state.message.includes('wallet is not configured') ||
      state.message.includes('wallet secret material is missing');
    body = isWalletLocked ? (
      <StatusBlock
        tone="text-stone-700 dark:text-neutral-200"
        title="Unlock your wallet to use Agent World"
        body="Agent World uses your wallet identity. Import your recovery phrase in Settings to continue."
      />
    ) : (
      <StatusBlock
        tone="text-red-600 dark:text-red-400"
        title="Failed to load profile"
        body={state.message}
      />
    );
  } else if (state.agents.length === 0) {
    body = (
      <StatusBlock
        tone="text-stone-600 dark:text-neutral-300"
        title="No agents found"
        body="No agent profiles are available yet."
      />
    );
  } else {
    // Render profile card for the first agent (mirrors Profiles.tsx behaviour).
    body = <AgentProfileCard agent={state.agents[0]} />;
  }

  return <PanelScaffold description="Agent profile">{body}</PanelScaffold>;
}
