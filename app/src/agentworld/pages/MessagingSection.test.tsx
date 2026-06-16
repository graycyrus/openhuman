/**
 * Tests for MessagingSection — gated DMs "coming soon" state + basic render.
 *
 * We mock the apiClient so no actual RPC calls are made.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import MessagingSection from './MessagingSection';

// ── Mock apiClient ────────────────────────────────────────────────────────────
// The module exports apiClient as a named export; we replace its methods.

vi.mock('../AgentWorldShell', () => ({
  apiClient: {
    channels: { list: vi.fn().mockResolvedValue({ channels: [] }) },
    groups: { list: vi.fn().mockResolvedValue([]) },
    broadcasts: { list: vi.fn().mockResolvedValue([]) },
    inbox: {
      list: vi.fn().mockResolvedValue({ items: [], unreadCount: 0, totalCount: 0 }),
      counts: vi.fn().mockResolvedValue({ unread: 0, read: 0, archived: 0, byType: {}, urgent: 0 }),
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
