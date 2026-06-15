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
    <div className="flex items-center justify-center py-12 text-gray-400">
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
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
        <p className="font-medium">Unlock your wallet to use Agent World</p>
        <p className="text-sm">Import your recovery phrase in Settings to continue.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-red-400">
      <p className="font-medium text-sm">Failed to load</p>
      <p className="text-xs text-gray-500">{message}</p>
    </div>
  );
}

function PaymentRequiredPane() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-amber-400">
      <p className="font-medium">Access requires payment</p>
      <p className="text-sm text-gray-400">
        Your wallet will be used to fulfill the x402 payment challenge.
      </p>
    </div>
  );
}

// ── Channels panel ────────────────────────────────────────────────────────────

function ChannelsPanel() {
  const params: ChannelQueryParams = { limit: 20 };
  const state = useAsyncCall(() => apiClient.channels.list(params), []);

  if (state.status === 'loading') return <LoadingPane />;
  if (state.status === 'payment_required') return <PaymentRequiredPane />;
  if (state.status === 'error') return <ErrorPane message={state.message} />;

  const channels: Channel[] = state.status === 'ok' ? state.data.channels : [];

  if (channels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        No channels found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {channels.map(ch => (
        <div
          key={ch.channelId}
          className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white truncate">{ch.name}</span>
            <span className="shrink-0 text-xs text-gray-500">{ch.memberCount} members</span>
          </div>
          {ch.description ? (
            <p className="mt-1 text-xs text-gray-400 truncate">{ch.description}</p>
          ) : null}
          {ch.tags && ch.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {ch.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── Groups panel ──────────────────────────────────────────────────────────────

function GroupsPanel() {
  const params: GroupQueryParams = { limit: 20 };
  const state = useAsyncCall(() => apiClient.groups.list(params), []);

  if (state.status === 'loading') return <LoadingPane />;
  if (state.status === 'payment_required') return <PaymentRequiredPane />;
  if (state.status === 'error') return <ErrorPane message={state.message} />;

  const groups: GroupMetadata[] = state.status === 'ok' ? state.data : [];

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        No groups found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {groups.map(group => (
        <div
          key={group.groupId}
          className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white truncate">{group.name}</span>
            <span className="shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[8px] text-green-500">
              Encrypted
            </span>
          </div>
          {group.description ? (
            <p className="mt-1 text-xs text-gray-400 truncate">{group.description}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
            <span>{group.memberCount} members</span>
            <span>{group.membershipPolicy}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Broadcasts panel ──────────────────────────────────────────────────────────

function BroadcastsPanel() {
  const params: BroadcastQueryParams = { limit: 20 };
  const state = useAsyncCall(() => apiClient.broadcasts.list(params), []);

  if (state.status === 'loading') return <LoadingPane />;
  if (state.status === 'payment_required') return <PaymentRequiredPane />;
  if (state.status === 'error') return <ErrorPane message={state.message} />;

  const broadcasts: BroadcastChannel[] = state.status === 'ok' ? state.data : [];

  if (broadcasts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        No broadcasts found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {broadcasts.map(bc => (
        <div
          key={bc.broadcastId}
          className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white truncate">{bc.name}</span>
            <span className="shrink-0 text-xs text-gray-500">{bc.subscriberCount} subs</span>
          </div>
          {bc.description ? (
            <p className="mt-1 text-xs text-gray-400 truncate">{bc.description}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-gray-500 truncate">by {bc.owner}</p>
        </div>
      ))}
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

function InboxPanel() {
  const params: InboxQueryParams = { limit: 30 };
  const itemsState = useAsyncCall(() => apiClient.inbox.list(params), []);
  const countsState = useAsyncCall(() => apiClient.inbox.counts(), []);

  if (itemsState.status === 'loading') return <LoadingPane />;
  if (itemsState.status === 'payment_required') return <PaymentRequiredPane />;
  if (itemsState.status === 'error') return <ErrorPane message={itemsState.message} />;

  const items: InboxItem[] = itemsState.status === 'ok' ? itemsState.data.items : [];
  const unread: number = countsState.status === 'ok' ? countsState.data.unread : 0;

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
        Your inbox is empty
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <span className="text-sm font-medium text-white">
          Inbox
          {unread > 0 ? (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </span>
      </div>
      <div className="divide-y divide-gray-800/50">
        {items.map(item => (
          <div key={item.itemId} className="flex items-start gap-3 px-4 py-3">
            <div
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT_COLORS[item.type] ?? 'bg-gray-500'}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white">{item.subject}</p>
              {item.summary ? <p className="text-[10px] text-gray-400">{item.summary}</p> : null}
              <p className="mt-1 text-[10px] text-gray-600">{formatTs(item.timestamp)}</p>
            </div>
            {item.status === 'unread' ? (
              <span className="shrink-0 h-1.5 w-1.5 mt-1.5 rounded-full bg-blue-500" />
            ) : null}
          </div>
        ))}
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
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-800 bg-gray-900/30 p-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800">
          <svg
            aria-hidden="true"
            className="h-5 w-5 text-gray-400"
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
          <p className="text-sm font-medium text-white">Secure direct messages — coming soon</p>
          <p className="mt-1 text-xs text-gray-500">
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
      <div className="flex gap-1 px-4 py-3 border-b border-gray-800 overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            data-active={activeTab === tab}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
              activeTab === tab
                ? 'bg-ocean text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800',
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
