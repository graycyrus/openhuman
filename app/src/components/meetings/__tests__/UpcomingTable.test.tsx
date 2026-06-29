import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import { UpcomingTable } from '../UpcomingTable';

// ---------------------------------------------------------------------------
// Mock the service so we control what meetings are returned.
// ---------------------------------------------------------------------------

const listMock = vi.fn();
const joinMock = vi.fn();

vi.mock('../../../services/meetCallService', async () => {
  const actual = await vi.importActual<typeof import('../../../services/meetCallService')>(
    '../../../services/meetCallService'
  );
  return {
    ...actual,
    listUpcomingMeetings: (...args: unknown[]) => listMock(...args),
    joinMeetViaBackendBot: (...args: unknown[]) => joinMock(...args),
  };
});

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const NOW = Date.now();

function makeMeeting(overrides: Partial<{
  calendar_event_id: string;
  title: string;
  start_time_ms: number;
  end_time_ms: number;
  meet_url: string | null;
  platform: string | null;
  participant_count: number | null;
  organizer: string | null;
  join_policy: string;
  calendar_source: string;
}> = {}) {
  return {
    calendar_event_id: 'evt-1',
    title: 'Weekly Sync',
    start_time_ms: NOW + 60 * 60 * 1000, // 1 hour from now
    end_time_ms: NOW + 90 * 60 * 1000,
    meet_url: 'https://meet.google.com/abc-def-ghi',
    platform: 'gmeet',
    participant_count: 4,
    organizer: 'alice@example.com',
    join_policy: 'ask',
    calendar_source: 'google:alice@example.com',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UpcomingTable', () => {
  beforeEach(() => {
    listMock.mockReset();
    joinMock.mockReset();
  });

  afterEach(() => cleanup());

  it('shows loading skeletons while fetching', () => {
    // Let listMock hang indefinitely.
    listMock.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<UpcomingTable />);
    // Skeletons are animate-pulse rows — table is present.
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders the table heading', async () => {
    listMock.mockResolvedValueOnce([]);
    renderWithProviders(<UpcomingTable />);
    // heading key resolves to "Upcoming" in en locale
    await waitFor(() => expect(screen.getByText(/upcoming/i)).toBeInTheDocument());
  });

  it('shows empty state when no meetings are returned', async () => {
    listMock.mockResolvedValueOnce([]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() =>
      expect(screen.getByText(/no upcoming meetings/i)).toBeInTheDocument()
    );
  });

  it('renders a meeting row with title, platform, and participant count', async () => {
    listMock.mockResolvedValueOnce([makeMeeting({ title: 'Design Review', participant_count: 7 })]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() => expect(screen.getByText('Design Review')).toBeInTheDocument());
    // Platform label for 'gmeet' → 'Google Meet'
    expect(screen.getByText(/google meet/i)).toBeInTheDocument();
    // participant count
    expect(screen.getByText(/7 participants/i)).toBeInTheDocument();
  });

  it('shows a date-group separator (Today)', async () => {
    listMock.mockResolvedValueOnce([makeMeeting()]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() => expect(screen.getByText(/today/i)).toBeInTheDocument());
  });

  it('renders the JoinPolicyToggle for each meeting row', async () => {
    listMock.mockResolvedValueOnce([makeMeeting()]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument());
    expect(screen.getByRole('radio', { name: /ask/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows a "Join" button (not "Join now") for non-imminent meetings', async () => {
    listMock.mockResolvedValueOnce([
      makeMeeting({ start_time_ms: NOW + 60 * 60 * 1000 }), // 1 hour away
    ]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /^join$/i });
      expect(btn).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /join now/i })).not.toBeInTheDocument();
  });

  it('shows a "Join now" primary button for imminent meetings (< 5 min)', async () => {
    listMock.mockResolvedValueOnce([
      makeMeeting({ start_time_ms: NOW + 2 * 60 * 1000 }), // 2 min away
    ]);
    renderWithProviders(<UpcomingTable />);
    // The button has an aria-label for screen readers ("Join {title}") so
    // we query by visible text content instead of accessible name.
    await waitFor(() =>
      expect(screen.getByText('Join now')).toBeInTheDocument()
    );
  });

  it('shows error state and retry button when fetch fails', async () => {
    listMock.mockRejectedValueOnce(new Error('Network fail'));
    renderWithProviders(<UpcomingTable />);
    // Wait for the error state: the retry button is the reliable indicator
    // (the error text uses a curly apostrophe that a straight-quote regex won't match).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    );
    // The error message is also present in the DOM (accept any apostrophe variant).
    expect(screen.getByText(/load upcoming meetings/i)).toBeInTheDocument();
  });

  it('retries on retry button click', async () => {
    listMock
      .mockRejectedValueOnce(new Error('Network fail'))
      .mockResolvedValueOnce([makeMeeting({ title: 'After Retry' })]);

    renderWithProviders(<UpcomingTable />);
    await waitFor(() => screen.getByRole('button', { name: /retry/i }));

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('After Retry')).toBeInTheDocument());
  });

  it('renders a refresh button in the header', async () => {
    listMock.mockResolvedValueOnce([]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    );
  });

  it('calls joinMeetViaBackendBot when Join button is clicked', async () => {
    joinMock.mockResolvedValueOnce({ meetUrl: 'https://meet.google.com/abc-def-ghi', platform: 'gmeet' });
    listMock.mockResolvedValueOnce([makeMeeting()]);
    renderWithProviders(<UpcomingTable />);

    const joinBtn = await screen.findByRole('button', { name: /^join$/i });
    fireEvent.click(joinBtn);

    await waitFor(() => expect(joinMock).toHaveBeenCalledOnce());
    expect(joinMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetUrl: 'https://meet.google.com/abc-def-ghi',
        listenOnly: true,
        correlationId: 'evt-1',
      })
    );
  });

  it('does not show a join button for meetings without a conferencing URL', async () => {
    listMock.mockResolvedValueOnce([makeMeeting({ meet_url: null })]);
    renderWithProviders(<UpcomingTable />);
    await waitFor(() => expect(screen.getByText('Weekly Sync')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^join/i })).not.toBeInTheDocument();
  });
});
