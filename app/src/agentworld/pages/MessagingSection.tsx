/**
 * MessagingSection — Agent World Messages tab.
 *
 * Renders public metadata for Channels, Groups, Broadcasts, and Inbox.
 * Encrypted DM compose/read is gated behind E2E_MESSAGING_ENABLED (currently
 * false) and shows a "Secure direct messages — coming soon" state instead.
 *
 * Signal protocol / keys.* methods are intentionally NOT wired here.
 */
import { useEffect, useState } from 'react';

import {
  type BroadcastChannel,
  type BroadcastQueryParams,
  type Channel,
  type ChannelQueryParams,
  type GroupMetadata,
  type GroupQueryParams,
  type InboxItem,
  type InboxQueryParams,
  PaymentRequiredError,
} from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';

// ── Feature gate ──────────────────────────────────────────────────────────────

/**
 * Signal-protocol encrypted DMs are deferred. When this flag is true the DMs
 * tab will render the real compose UI; until then it renders the "coming soon"
 * placeholder. Do NOT wire this to Rust Config — it's a UI-only fence.
 */
const E2E_MESSAGING_ENABLED = false;

// ── Tab definition ────────────────────────────────────────────────────────────

const TABS = ['channels', 'groups', 'broadcasts', 'inbox', 'dms'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  channels: 'Channels',
  groups: 'Groups',
  broadcasts: 'Broadcasts',
  inbox: 'Inbox',
  dms: 'DMs',
};

// ── Generic async-state shape ─────────────────────────────────────────────────

type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'payment_required'; challenge: unknown }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: T };

function useAsyncCall<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    void fetcher()
      .then(data => {
        if (!cancelled) setState({ status: 'ok', data });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function LoadingPane() {
  return (
    <div className="flex items-center justify-center py-12 text-stone-500 dark:text-neutral-400">
      <span className="animate-pulse text-sm">Loading…</span>
    </div>
  );
}

function ErrorPane({ message }: { message: string }) {
  const isWalletLocked =
    message.includes('wallet is not configured') ||
    message.includes('wallet secret material is missing');

  if (isWalletLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-stone-500 dark:text-neutral-400">
        <p className="font-medium">Unlock your wallet to use Agent World</p>
        <p className="text-sm">Import your recovery phrase in Settings to continue.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-red-400">
      <p className="font-medium text-sm">Failed to load</p>
      <p className="text-xs text-stone-400 dark:text-neutral-500">{message}</p>
    </div>
  );
}

function PaymentRequiredPane() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-amber-400">
      <p className="font-medium">Access requires payment</p>
      <p className="text-sm text-stone-500 dark:text-neutral-400">
        Your wallet will be used to fulfill the x402 payment challenge.
      </p>
    </div>
  );
}

// ── Channels panel ────────────────────────────────────────────────────────────

function ChannelsPanel() {
  const params: ChannelQueryParams = { limit: 20 };
  const { version, busyKey, error: actionError, run } = useRowActions();
  const state = useAsyncCall(() => apiClient.channels.list(params), [version]);

  if (state.status === 'loading') return <LoadingPane />;
  if (state.status === 'payment_required') return <PaymentRequiredPane />;
  if (state.status === 'error') return <ErrorPane message={state.message} />;

  const channels: Channel[] = state.status === 'ok' ? state.data.channels : [];

  if (channels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-stone-400 dark:text-neutral-500 text-sm">
        No channels found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actionError ? <ActionErrorBanner message={actionError} /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {channels.map(ch => {
          const busy = busyKey === ch.channelId;
          return (
            <div
              key={ch.channelId}
              className="rounded-lg border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-900/50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-900 dark:text-neutral-100 truncate">
                  {ch.name}
                </span>
                <span className="shrink-0 text-xs text-stone-400 dark:text-neutral-500">
                  {ch.memberCount} members
                </span>
              </div>
              {ch.description ? (
                <p className="mt-1 text-xs text-stone-500 dark:text-neutral-400 truncate">
                  {ch.description}
                </p>
              ) : null}
              {ch.tags && ch.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ch.tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-full bg-stone-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] text-stone-500 dark:text-neutral-400">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex gap-1">
                <RowAction
                  label="Join"
                  disabled={busy}
                  onClick={() => run(ch.channelId, () => apiClient.channels.join(ch.channelId))}
                />
                <RowAction
                  label="Leave"
                  disabled={busy}
                  onClick={() => run(ch.channelId, () => apiClient.channels.leave(ch.channelId))}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Groups panel ──────────────────────────────────────────────────────────────

function GroupsPanel() {
  const params: GroupQueryParams = { limit: 20 };
  const { version, busyKey, error: actionError, run } = useRowActions();
  const state = useAsyncCall(() => apiClient.groups.list(params), [version]);

  if (state.status === 'loading') return <LoadingPane />;
  if (state.status === 'payment_required') return <PaymentRequiredPane />;
  if (state.status === 'error') return <ErrorPane message={state.message} />;

  const groups: GroupMetadata[] = state.status === 'ok' ? state.data : [];

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-stone-400 dark:text-neutral-500 text-sm">
        No groups found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actionError ? <ActionErrorBanner message={actionError} /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {groups.map(group => {
          const busy = busyKey === group.groupId;
          return (
            <div
              key={group.groupId}
              className="rounded-lg border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-900/50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-900 dark:text-neutral-100 truncate">
                  {group.name}
                </span>
                <span className="shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] text-green-500">
                  Encrypted
                </span>
              </div>
              {group.description ? (
                <p className="mt-1 text-xs text-stone-500 dark:text-neutral-400 truncate">
                  {group.description}
                </p>
              ) : null}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-stone-400 dark:text-neutral-500">
                <span>{group.memberCount} members</span>
                <span>{group.membershipPolicy}</span>
              </div>
              <div className="mt-2 flex gap-1">
                <RowAction
                  label="Join"
                  disabled={busy}
                  onClick={() => run(group.groupId, () => apiClient.groups.join(group.groupId))}
                />
                <RowAction
                  label="Leave"
                  disabled={busy}
                  onClick={() => run(group.groupId, () => apiClient.groups.leave(group.groupId))}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Broadcasts panel ──────────────────────────────────────────────────────────

function BroadcastsPanel() {
  const params: BroadcastQueryParams = { limit: 20 };
  const { version, busyKey, error: actionError, run } = useRowActions();
  const state = useAsyncCall(() => apiClient.broadcasts.list(params), [version]);

  if (state.status === 'loading') return <LoadingPane />;
  if (state.status === 'payment_required') return <PaymentRequiredPane />;
  if (state.status === 'error') return <ErrorPane message={state.message} />;

  const broadcasts: BroadcastChannel[] = state.status === 'ok' ? state.data : [];

  if (broadcasts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-stone-400 dark:text-neutral-500 text-sm">
        No broadcasts found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actionError ? <ActionErrorBanner message={actionError} /> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {broadcasts.map(bc => {
          const busy = busyKey === bc.broadcastId;
          return (
            <div
              key={bc.broadcastId}
              className="rounded-lg border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-900/50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-900 dark:text-neutral-100 truncate">
                  {bc.name}
                </span>
                <span className="shrink-0 text-xs text-stone-400 dark:text-neutral-500">
                  {bc.subscriberCount} subs
                </span>
              </div>
              {bc.description ? (
                <p className="mt-1 text-xs text-stone-500 dark:text-neutral-400 truncate">
                  {bc.description}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] text-stone-400 dark:text-neutral-500 truncate">
                by {bc.owner}
              </p>
              <div className="mt-2 flex gap-1">
                <RowAction
                  label="Subscribe"
                  disabled={busy}
                  onClick={() =>
                    run(bc.broadcastId, () => apiClient.broadcasts.subscribe(bc.broadcastId))
                  }
                />
                <RowAction
                  label="Unsubscribe"
                  disabled={busy}
                  onClick={() =>
                    run(bc.broadcastId, () => apiClient.broadcasts.unsubscribe(bc.broadcastId))
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inbox panel ───────────────────────────────────────────────────────────────

const TYPE_DOT_COLORS: Record<string, string> = {
  TASK_REQUEST: 'bg-blue-500',
  TASK_UPDATE: 'bg-blue-400',
  PAYMENT_RECEIVED: 'bg-green-500',
  PAYMENT_REQUIRED: 'bg-green-400',
  GROUP_INVITE: 'bg-purple-500',
  GROUP_MESSAGE: 'bg-purple-400',
  ARTIFACT_SHARED: 'bg-cyan-500',
  IDENTITY_TRANSFER: 'bg-orange-500',
  OFFER_RECEIVED: 'bg-teal-500',
  SUBSCRIPTION_EVENT: 'bg-indigo-500',
  SYSTEM: 'bg-yellow-500',
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/** Small row action button (shared across inbox / channels / groups / broadcasts). */
function RowAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
      {label}
    </button>
  );
}

/** Inline error banner for a failed row action. */
function ActionErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
      {message}
    </div>
  );
}

/**
 * Shared write-action runner for list panels: tracks a refetch `version`, the
 * in-flight `busyKey`, and an `error`. `run(key, fn)` disables the row, awaits
 * the action, then bumps `version` to refetch; PaymentRequiredError surfaces a
 * clear message.
 */
function useRowActions() {
  const [version, setVersion] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusyKey(key);
    setError(null);
    try {
      await fn();
      setVersion(v => v + 1);
    } catch (err) {
      setError(
        err instanceof PaymentRequiredError ? 'Payment required for this action.' : String(err),
      );
    } finally {
      setBusyKey(null);
    }
  }

  return { version, busyKey, error, run };
}

function InboxPanel() {
  const params: InboxQueryParams = { limit: 30 };
  const { version, busyKey, error: actionError, run: runAction } = useRowActions();
  const itemsState = useAsyncCall(() => apiClient.inbox.list(params), [version]);
  const countsState = useAsyncCall(() => apiClient.inbox.counts(), [version]);

  if (itemsState.status === 'loading') return <LoadingPane />;
  if (itemsState.status === 'payment_required') return <PaymentRequiredPane />;
  if (itemsState.status === 'error') return <ErrorPane message={itemsState.message} />;

  const items: InboxItem[] = itemsState.status === 'ok' ? itemsState.data.items : [];
  const unread: number = countsState.status === 'ok' ? countsState.data.unread : 0;
  const anyBusy = busyKey !== null;

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-stone-400 dark:text-neutral-500 text-sm">
        Your inbox is empty
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-stone-200 dark:border-neutral-800">
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-neutral-800 px-4 py-2">
        <span className="text-sm font-medium text-stone-900 dark:text-neutral-100">
          Inbox
          {unread > 0 ? (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </span>
        {unread > 0 ? (
          <RowAction
            label="Mark all read"
            disabled={anyBusy}
            onClick={() => runAction('__all__', () => apiClient.inbox.markAllRead())}
          />
        ) : null}
      </div>
      {actionError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      ) : null}
      <div className="divide-y divide-stone-200 dark:divide-neutral-800/50">
        {items.map(item => {
          const busy = busyKey === item.itemId;
          const archived = item.status === 'archived';
          return (
            <div key={item.itemId} className="flex items-start gap-3 px-4 py-3">
              <div
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[item.type] ?? 'bg-stone-400 dark:bg-neutral-500'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-stone-900 dark:text-neutral-100">
                  {item.subject}
                </p>
                {item.summary ? (
                  <p className="text-[10px] text-stone-500 dark:text-neutral-400">{item.summary}</p>
                ) : null}
                <p className="mt-1 text-[10px] text-stone-400 dark:text-neutral-500">
                  {formatTs(item.timestamp)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.status === 'unread' ? (
                  <RowAction
                    label="Mark read"
                    disabled={busy || anyBusy}
                    onClick={() => runAction(item.itemId, () => apiClient.inbox.markRead(item.itemId))}
                  />
                ) : null}
                {archived ? (
                  <RowAction
                    label="Unarchive"
                    disabled={busy || anyBusy}
                    onClick={() =>
                      runAction(item.itemId, () => apiClient.inbox.unarchive(item.itemId))
                    }
                  />
                ) : (
                  <RowAction
                    label="Archive"
                    disabled={busy || anyBusy}
                    onClick={() => runAction(item.itemId, () => apiClient.inbox.archive(item.itemId))}
                  />
                )}
                <RowAction
                  label="Remove"
                  disabled={busy || anyBusy}
                  onClick={() => runAction(item.itemId, () => apiClient.inbox.remove(item.itemId))}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DMs panel (gated) ─────────────────────────────────────────────────────────

function DmsPanel() {
  if (!E2E_MESSAGING_ENABLED) {
    return (
      <div
        data-testid="dms-coming-soon"
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/30 p-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 dark:bg-neutral-800">
          <svg
            aria-hidden="true"
            className="h-5 w-5 text-stone-500 dark:text-neutral-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75A4.5 4.5 0 0 0 12 2.25 4.5 4.5 0 0 0 7.5 6.75v3.75m-2.25 0h13.5c.621 0 1.125.504 1.125 1.125v7.5c0 .621-.504 1.125-1.125 1.125H5.25A1.125 1.125 0 0 1 4.125 19.125v-7.5c0-.621.504-1.125 1.125-1.125Z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-stone-900 dark:text-neutral-100">
            Secure direct messages — coming soon
          </p>
          <p className="mt-1 text-xs text-stone-400 dark:text-neutral-500">
            End-to-end encrypted DMs use the Signal protocol. Full support is in progress.
          </p>
        </div>
      </div>
    );
  }

  // Future: wire useDirectMessages() hook when E2E_MESSAGING_ENABLED = true.
  return null;
}

// ── Messaging section root ────────────────────────────────────────────────────

export default function MessagingSection() {
  const [activeTab, setActiveTab] = useState<Tab>('channels');

  return (
    <div className="flex flex-col h-full">
      {/* Tab chips */}
      <div className="flex gap-1 px-4 py-3 border-b border-stone-200 dark:border-neutral-800 overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            data-active={activeTab === tab}
            className={[
              'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'bg-stone-800 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800',
            ].join(' ')}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'channels' && <ChannelsPanel />}
        {activeTab === 'groups' && <GroupsPanel />}
        {activeTab === 'broadcasts' && <BroadcastsPanel />}
        {activeTab === 'inbox' && <InboxPanel />}
        {activeTab === 'dms' && <DmsPanel />}
      </div>
    </div>
  );
}
