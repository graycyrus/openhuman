/**
 * Tests for MessagingSection — gated DMs "coming soon" state + basic render.
 *
 * We mock the apiClient so no actual RPC calls are made.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { apiClient } from '../AgentWorldShell';
import MessagingSection from './MessagingSection';

// ── Mock apiClient ────────────────────────────────────────────────────────────
// The module exports apiClient as a named export; we replace its methods.

vi.mock('../AgentWorldShell', () => ({
  apiClient: {
    channels: {
      list: vi.fn().mockResolvedValue({ channels: [] }),
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
    },
    groups: {
      list: vi.fn().mockResolvedValue([]),
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
    },
    broadcasts: {
      list: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    },
    inbox: {
      list: vi.fn().mockResolvedValue({ items: [], unreadCount: 0, totalCount: 0 }),
      counts: vi.fn().mockResolvedValue({ unread: 0, read: 0, archived: 0, byType: {}, urgent: 0 }),
      markRead: vi.fn().mockResolvedValue(undefined),
      markAllRead: vi.fn().mockResolvedValue(undefined),
      archive: vi.fn().mockResolvedValue(undefined),
      unarchive: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── DMs gated state ───────────────────────────────────────────────────────────

describe('DMs gated state', () => {
  test('renders "Secure direct messages — coming soon" when DMs tab is active', async () => {
    render(<MessagingSection />);

    // Click the DMs tab
    const dmsButton = screen.getByRole('button', { name: 'DMs' });
    await userEvent.click(dmsButton);

    expect(screen.getByTestId('dms-coming-soon')).toBeInTheDocument();
    expect(screen.getByText(/Secure direct messages — coming soon/i)).toBeInTheDocument();
  });

  test('does NOT render the DMs compose form when gate is off', async () => {
    render(<MessagingSection />);

    const dmsButton = screen.getByRole('button', { name: 'DMs' });
    await userEvent.click(dmsButton);

    // No message input should exist
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/@handle or key/i)).not.toBeInTheDocument();
  });
});

// ── Tab navigation ────────────────────────────────────────────────────────────

describe('tab navigation', () => {
  test('defaults to Channels tab', () => {
    render(<MessagingSection />);
    const channelsBtn = screen.getByRole('button', { name: 'Channels' });
    expect(channelsBtn).toHaveAttribute('data-active', 'true');
  });

  test('can switch to Groups tab', async () => {
    render(<MessagingSection />);
    const groupsBtn = screen.getByRole('button', { name: 'Groups' });
    await userEvent.click(groupsBtn);
    expect(groupsBtn).toHaveAttribute('data-active', 'true');
  });

  test('can switch to Inbox tab', async () => {
    render(<MessagingSection />);
    const inboxBtn = screen.getByRole('button', { name: 'Inbox' });
    await userEvent.click(inboxBtn);
    expect(inboxBtn).toHaveAttribute('data-active', 'true');
  });
});

// ── Empty states ──────────────────────────────────────────────────────────────

describe('empty states', () => {
  test('shows "No channels found" when channels list is empty', async () => {
    render(<MessagingSection />);
    // Wait for the async fetch to settle
    expect(await screen.findByText(/No channels found/i)).toBeInTheDocument();
  });

  test('shows "No groups found" when groups list is empty', async () => {
    render(<MessagingSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(await screen.findByText(/No groups found/i)).toBeInTheDocument();
  });

  test('shows "No broadcasts found" when broadcasts list is empty', async () => {
    render(<MessagingSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Broadcasts' }));
    expect(await screen.findByText(/No broadcasts found/i)).toBeInTheDocument();
  });

  test('shows "Your inbox is empty" when inbox is empty', async () => {
    render(<MessagingSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Inbox' }));
    expect(await screen.findByText(/Your inbox is empty/i)).toBeInTheDocument();
  });
});

// ── Inbox write actions ───────────────────────────────────────────────────────

describe('inbox actions', () => {
  const item = {
    itemId: 'item-1',
    type: 'message',
    status: 'unread',
    priority: 'normal',
    timestamp: new Date('2026-01-01T00:00:00Z').toISOString(),
    subject: 'Hello there',
  };

  beforeEach(() => {
    vi.mocked(apiClient.inbox.list).mockResolvedValue({
      items: [item],
      unreadCount: 1,
      totalCount: 1,
    });
    vi.mocked(apiClient.inbox.counts).mockResolvedValue({
      unread: 1,
      read: 0,
      archived: 0,
      byType: {},
      urgent: 0,
    });
  });

  async function openInbox() {
    render(<MessagingSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Inbox' }));
    await screen.findByText('Hello there');
  }

  test('Mark read calls inbox.markRead with the item id', async () => {
    await openInbox();
    await userEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(apiClient.inbox.markRead).toHaveBeenCalledWith('item-1');
  });

  test('Archive calls inbox.archive with the item id', async () => {
    await openInbox();
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(apiClient.inbox.archive).toHaveBeenCalledWith('item-1');
  });

  test('Remove calls inbox.remove with the item id', async () => {
    await openInbox();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(apiClient.inbox.remove).toHaveBeenCalledWith('item-1');
  });

  test('Mark all read calls inbox.markAllRead', async () => {
    await openInbox();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(apiClient.inbox.markAllRead).toHaveBeenCalled();
  });

  test('refetches the inbox after an action settles', async () => {
    await openInbox();
    const before = vi.mocked(apiClient.inbox.list).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(vi.mocked(apiClient.inbox.list).mock.calls.length).toBeGreaterThan(before);
  });
});

// ── Channel / broadcast / group membership actions ────────────────────────────

describe('membership actions', () => {
  test('channel Join calls channels.join with the channel id', async () => {
    vi.mocked(apiClient.channels.list).mockResolvedValue({
      channels: [
        {
          channelId: 'ch-1',
          name: 'General',
          memberCount: 3,
          creator: 'someone',
          isPublic: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    render(<MessagingSection />);
    await screen.findByText('General');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(apiClient.channels.join).toHaveBeenCalledWith('ch-1');
  });

  test('broadcast Subscribe calls broadcasts.subscribe with the broadcast id', async () => {
    vi.mocked(apiClient.broadcasts.list).mockResolvedValue([
      {
        broadcastId: 'bc-1',
        name: 'Updates',
        subscriberCount: 9,
        owner: 'someone',
        visibility: 'public',
      },
    ]);
    render(<MessagingSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Broadcasts' }));
    await screen.findByText('Updates');
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(apiClient.broadcasts.subscribe).toHaveBeenCalledWith('bc-1');
  });

  test('group Leave calls groups.leave with the group id', async () => {
    vi.mocked(apiClient.groups.list).mockResolvedValue([
      {
        groupId: 'g-1',
        name: 'Builders',
        membershipPolicy: 'open',
        memberCount: 5,
        membershipEpoch: 1,
        createdBy: 'someone',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    render(<MessagingSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Groups' }));
    await screen.findByText('Builders');
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(apiClient.groups.leave).toHaveBeenCalledWith('g-1');
  });
});
