/**
 * LedgerSection — Agent World "Ledger" section.
 *
 * Renders the public transaction ledger via
 * `apiClient.graphql.ledgerTransactions()` (GraphQL, no auth required).
 * Supports inline row expansion to show full transaction details, metadata,
 * and a Solana explorer link via the shared `explorerTxUrl` helper.
 *
 * Pattern mirrors FeedSection: useState + useEffect fetch, PanelScaffold
 * wrapper, StatusBlock for loading/error/empty states.
 */
import { useEffect, useState } from 'react';

import PanelScaffold from '../../components/layout/PanelScaffold';
import { type GqlLedgerTransaction } from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';
import { explorerTxUrl } from '../hooks/useX402Buy';

// ── State types ───────────────────────────────────────────────────────────────

type LedgerState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; transactions: GqlLedgerTransaction[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function abbreviateAddress(addr: string | undefined): string {
  if (!addr) return '-';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

/** Centered status message for loading / error / info states. */
function StatusBlock({ tone, title, body }: { tone: string; title: string; body?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
      <p className={`text-base font-medium ${tone}`}>{title}</p>
      {body && <p className="max-w-md text-sm text-stone-500 dark:text-neutral-400">{body}</p>}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'SETTLED'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : status === 'PENDING'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : status === 'FAILED'
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-400';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const color =
    type === 'REGISTRATION'
      ? 'bg-ocean-100 text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-400'
      : type === 'SALE'
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
        : type === 'FEE'
          ? 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-400'
          : 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-neutral-400';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {type}
    </span>
  );
}

// ── TransactionRow ─────────────────────────────────────────────────────────────

function TransactionRow({
  tx,
  expanded,
  onToggle,
}: {
  tx: GqlLedgerTransaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  const amountLabel = tx.amount && tx.asset ? `${tx.amount} ${tx.asset}` : (tx.amount ?? '-');

  return (
    <div className="border-b border-stone-100 last:border-0 dark:border-neutral-800">
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800/50">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Type */}
          <TypeBadge type={tx.type} />

          {/* Amount */}
          <span className="text-sm font-medium text-stone-900 dark:text-neutral-100">
            {amountLabel}
          </span>

          {/* From → To */}
          <span className="text-xs text-stone-500 dark:text-neutral-400">
            {abbreviateAddress(tx.from)} → {abbreviateAddress(tx.to)}
          </span>

          {/* Network */}
          <span className="text-xs text-stone-400 dark:text-neutral-500">{tx.network}</span>

          {/* Status */}
          <StatusBadge status={tx.status} />

          {/* Time */}
          <span className="ml-auto text-xs text-stone-400 dark:text-neutral-500">
            {relativeTime(tx.timestamp)}
          </span>

          {/* Explorer link */}
          {tx.onChainTx && (
            <a
              href={explorerTxUrl(tx.onChainTx, tx.network)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ocean-600 hover:text-ocean-700 dark:text-ocean-400 dark:hover:text-ocean-300"
              onClick={e => e.stopPropagation()}>
              View on chain
            </a>
          )}

          {/* Expand chevron */}
          <svg
            className={`h-4 w-4 shrink-0 text-stone-400 transition-transform dark:text-neutral-500 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {/* Ledger TX ID */}
            <dt className="font-medium text-stone-500 dark:text-neutral-400">Tx ID</dt>
            <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">{tx.txId}</dd>

            {/* Visibility */}
            <dt className="font-medium text-stone-500 dark:text-neutral-400">Visibility</dt>
            <dd className="text-stone-800 dark:text-neutral-200">{tx.visibility}</dd>

            {/* Full From */}
            <dt className="font-medium text-stone-500 dark:text-neutral-400">From</dt>
            <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
              {tx.from ?? '-'}
            </dd>

            {/* Full To */}
            <dt className="font-medium text-stone-500 dark:text-neutral-400">To</dt>
            <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
              {tx.to ?? '-'}
            </dd>

            {/* Reference */}
            {tx.reference && (
              <>
                <dt className="font-medium text-stone-500 dark:text-neutral-400">Ref kind</dt>
                <dd className="text-stone-800 dark:text-neutral-200">{tx.reference.kind}</dd>

                {tx.reference.id && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Ref ID</dt>
                    <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                      {tx.reference.id}
                    </dd>
                  </>
                )}
                {tx.reference.parentTxId && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Parent Tx</dt>
                    <dd className="break-all font-mono text-stone-800 dark:text-neutral-200">
                      {tx.reference.parentTxId}
                    </dd>
                  </>
                )}
                {tx.reference.rate && (
                  <>
                    <dt className="font-medium text-stone-500 dark:text-neutral-400">Rate</dt>
                    <dd className="text-stone-800 dark:text-neutral-200">{tx.reference.rate}</dd>
                  </>
                )}
              </>
            )}
          </dl>

          {/* Metadata key-value table */}
          {tx.metadata && Object.keys(tx.metadata).length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs font-medium text-stone-500 dark:text-neutral-400">
                Metadata
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {Object.entries(tx.metadata).map(([key, val]) => (
                  <>
                    <dt
                      key={`k-${key}`}
                      className="font-medium text-stone-500 dark:text-neutral-400">
                      {key}
                    </dt>
                    <dd key={`v-${key}`} className="break-all text-stone-800 dark:text-neutral-200">
                      {typeof val === 'string' ? val : JSON.stringify(val)}
                    </dd>
                  </>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LedgerSection (main export) ───────────────────────────────────────────────

export default function LedgerSection() {
  const [ledgerState, setLedgerState] = useState<LedgerState>({ status: 'loading' });
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // ── Fetch ledger transactions ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLedgerState({ status: 'loading' });

    // TODO(phase-2-follow-up): implement pagination with offset or cursor.
    void apiClient.graphql
      .ledgerTransactions({ limit: 50 })
      .then(result => {
        if (cancelled) return;
        const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
        setLedgerState({ status: 'ok', transactions });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLedgerState({ status: 'error', message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  let body: React.ReactNode;

  if (ledgerState.status === 'loading') {
    body = (
      <div className="flex h-64 items-center justify-center text-stone-400 dark:text-neutral-500">
        <span className="animate-pulse text-sm">Loading ledger…</span>
      </div>
    );
  } else if (ledgerState.status === 'error') {
    body = (
      <StatusBlock
        tone="text-red-600 dark:text-red-400"
        title="Failed to load ledger"
        body={ledgerState.message}
      />
    );
  } else if (ledgerState.transactions.length === 0) {
    body = (
      <StatusBlock
        tone="text-stone-500 dark:text-neutral-400"
        title="No transactions found"
        body="The ledger is empty or no transactions match the current filter."
      />
    );
  } else {
    body = (
      <div className="rounded-lg border border-stone-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {ledgerState.transactions.map(tx => (
          <TransactionRow
            key={tx.txId}
            tx={tx}
            expanded={expandedTxId === tx.txId}
            onToggle={() => setExpandedTxId(prev => (prev === tx.txId ? null : tx.txId))}
          />
        ))}
      </div>
    );
  }

  return <PanelScaffold description="Ledger">{body}</PanelScaffold>;
}
