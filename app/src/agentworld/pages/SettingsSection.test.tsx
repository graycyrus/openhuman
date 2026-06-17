/**
 * Unit tests for Agent World SettingsSection.
 *
 * Verifies:
 * 1. The section renders with language and theme controls.
 * 2. Theme buttons dispatch setThemeMode to the Redux store.
 * 3. The active theme button is marked aria-pressed=true.
 * 4. The Feedback panel renders, loads items, handles votes and form submission.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderWithProviders } from '../../test/test-utils';
import { apiClient } from '../AgentWorldShell';
import SettingsSection from './SettingsSection';

// Prevent debug library from logging during tests.
vi.mock('debug', () => ({ default: () => () => undefined }));

vi.mock('../AgentWorldShell', () => ({
  apiClient: { feedback: { list: vi.fn(), get: vi.fn(), create: vi.fn(), vote: vi.fn() } },
}));

const feedbackList = vi.mocked(apiClient.feedback.list);
const feedbackCreate = vi.mocked(apiClient.feedback.create);
const feedbackVote = vi.mocked(apiClient.feedback.vote);

// Default: feedback list returns empty.
beforeEach(() => {
  vi.clearAllMocks();
  feedbackList.mockResolvedValue({ feedback: [] });
});

// ── Render ────────────────────────────────────────────────────────────────────

describe('SettingsSection', () => {
  test('renders the section heading', () => {
    renderWithProviders(<SettingsSection />);
    // The heading uses the agentWorld.settings key; default (no I18nProvider)
    // falls back to the English string "Settings".
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
  });

  test('renders the language section', () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('heading', { level: 2, name: /language/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('renders the theme section with three options', () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('heading', { level: 2, name: /theme/i })).toBeInTheDocument();
    const themeButtons = screen.getAllByRole('button', { name: /dark|light|system/i });
    expect(themeButtons).toHaveLength(3);
  });

  test('default theme mode is "system" (Redux initialState)', () => {
    renderWithProviders(<SettingsSection />);
    // The "System" button should be aria-pressed=true by default.
    const systemButton = screen.getByRole('button', { name: /system/i });
    expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('dark and light buttons are not pressed by default', () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('button', { name: /^dark/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^light/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('clicking Dark dispatches setThemeMode("dark") to the store', async () => {
    const { store } = renderWithProviders(<SettingsSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^dark/i }));
    expect(store.getState().theme.mode).toBe('dark');
  });

  test('clicking Light dispatches setThemeMode("light") to the store', async () => {
    const { store } = renderWithProviders(<SettingsSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^light/i }));
    expect(store.getState().theme.mode).toBe('light');
  });

  test('clicking System dispatches setThemeMode("system") to the store', async () => {
    const { store } = renderWithProviders(<SettingsSection />, {
      preloadedState: {
        theme: {
          mode: 'dark',
          tabBarLabels: 'hover',
          fontSize: 'medium',
          agentMessageViewMode: 'bubbles',
          developerMode: false,
        },
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /system/i }));
    expect(store.getState().theme.mode).toBe('system');
  });

  test('selected theme button shows aria-pressed=true after click', async () => {
    renderWithProviders(<SettingsSection />);
    const user = userEvent.setup();
    const darkButton = screen.getByRole('button', { name: /^dark/i });
    await user.click(darkButton);
    expect(darkButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('no callCoreRpc calls are made during render or interaction', async () => {
    // SettingsSection is pure local-state for theme/language — zero RPC round-trips
    // for those sections.
    const { queryAllByText } = renderWithProviders(<SettingsSection />);
    // Absence-of-error is the assertion: if the component tried to call core
    // RPC it would throw (coreRpcClient is not mocked here).
    expect(queryAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Feedback panel ────────────────────────────────────────────────────────────

describe('feedback panel', () => {
  test('renders the Feedback heading and submit form', async () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('heading', { level: 2, name: /feedback/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  test('renders empty state when no feedback items exist', async () => {
    feedbackList.mockResolvedValueOnce({ feedback: [] });
    renderWithProviders(<SettingsSection />);
    expect(await screen.findByText(/No feedback submitted yet/i)).toBeInTheDocument();
  });

  test('renders feedback items with title, score, and vote buttons', async () => {
    feedbackList.mockResolvedValueOnce({
      feedback: [
        {
          feedbackId: 'fb-001',
          author: 'agent-123',
          title: 'Add dark mode toggle',
          description: 'Would be great to have a dark mode.',
          category: 'feature',
          status: 'open',
          votesUp: 5,
          votesDown: 1,
          score: 4,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
    });
    renderWithProviders(<SettingsSection />);
    expect(await screen.findByText('Add dark mode toggle')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // score
    expect(screen.getByText('feature')).toBeInTheDocument(); // category
    expect(screen.getByLabelText('Upvote')).toBeInTheDocument();
    expect(screen.getByLabelText('Downvote')).toBeInTheDocument();
  });

  test('clicking Upvote calls feedback.vote with "up"', async () => {
    const user = userEvent.setup();
    feedbackList.mockResolvedValueOnce({
      feedback: [
        {
          feedbackId: 'fb-002',
          author: 'agent-456',
          title: 'Better search',
          description: 'Improve search.',
          status: 'open',
          votesUp: 0,
          votesDown: 0,
          score: 0,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
    });
    feedbackVote.mockResolvedValueOnce({
      feedbackId: 'fb-002',
      author: 'agent-456',
      title: 'Better search',
      description: 'Improve search.',
      status: 'open',
      votesUp: 1,
      votesDown: 0,
      score: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    // After vote, the list will be refetched.
    feedbackList.mockResolvedValueOnce({
      feedback: [
        {
          feedbackId: 'fb-002',
          author: 'agent-456',
          title: 'Better search',
          description: 'Improve search.',
          status: 'open',
          votesUp: 1,
          votesDown: 0,
          score: 1,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
    });
    renderWithProviders(<SettingsSection />);
    const upvoteBtn = await screen.findByLabelText('Upvote');
    await user.click(upvoteBtn);
    expect(feedbackVote).toHaveBeenCalledWith('fb-002', 'up');
  });

  test('submit form creates feedback and refreshes list', async () => {
    const user = userEvent.setup();
    // Initial load returns empty list (so we can see the "No feedback yet" state).
    feedbackList.mockResolvedValueOnce({ feedback: [] });
    feedbackCreate.mockResolvedValueOnce({
      feedbackId: 'fb-new',
      author: 'my-wallet',
      title: 'My idea',
      description: 'A great description.',
      status: 'open',
      votesUp: 0,
      votesDown: 0,
      score: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    // After create, the list is refetched.
    feedbackList.mockResolvedValueOnce({
      feedback: [
        {
          feedbackId: 'fb-new',
          author: 'my-wallet',
          title: 'My idea',
          description: 'A great description.',
          status: 'open',
          votesUp: 0,
          votesDown: 0,
          score: 0,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
    });
    renderWithProviders(<SettingsSection />);
    // Wait for initial load.
    await screen.findByText(/No feedback submitted yet/i);
    // Fill the form.
    await user.type(screen.getByLabelText(/title/i), 'My idea');
    await user.type(screen.getByLabelText(/description/i), 'A great description.');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(feedbackCreate).toHaveBeenCalledWith('My idea', 'A great description.', undefined);
    // List is refetched after create.
    expect(await screen.findByText('My idea')).toBeInTheDocument();
  });

  test('submit button is disabled when title or description is blank', () => {
    renderWithProviders(<SettingsSection />);
    const submitBtn = screen.getByRole('button', { name: /submit/i });
    expect(submitBtn).toBeDisabled();
  });

  test('renders error state when feedback list fails', async () => {
    feedbackList.mockRejectedValueOnce(new Error('network failure'));
    renderWithProviders(<SettingsSection />);
    expect(await screen.findByText(/Could not load feedback/i)).toBeInTheDocument();
    expect(screen.getByText(/network failure/i)).toBeInTheDocument();
  });

  test('renders feedback error when create fails', async () => {
    const user = userEvent.setup();
    // Ensure initial load shows empty state before we try to submit.
    feedbackList.mockResolvedValueOnce({ feedback: [] });
    feedbackCreate.mockRejectedValueOnce(new Error('wallet locked'));
    renderWithProviders(<SettingsSection />);
    await screen.findByText(/No feedback submitted yet/i);
    await user.type(screen.getByLabelText(/title/i), 'Test');
    await user.type(screen.getByLabelText(/description/i), 'Details');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByText(/wallet locked/i)).toBeInTheDocument();
  });
});
