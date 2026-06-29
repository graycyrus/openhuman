import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import type { MeetCallRecord, MeetCallDetail } from '../../../services/meetCallService';
import HistorySection from '../HistorySection';

const listMeetCallsMock = vi.fn();
const getMeetCallDetailMock = vi.fn();

vi.mock('../../../services/meetCallService', async () => {
  const actual = await vi.importActual<typeof import('../../../services/meetCallService')>(
    '../../../services/meetCallService'
  );
  return {
    ...actual,
    listMeetCalls: (...args: unknown[]) => listMeetCallsMock(...args),
    getMeetCallDetail: (...args: unknown[]) => getMeetCallDetailMock(...args),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOW = Date.now();

const todayCall: MeetCallRecord = {
  request_id: 'req-today',
  meet_url: 'https://meet.google.com/abc-def-ghi',
  bot_display_name: 'OpenHuman',
  owner_display_name: 'Alice',
  started_at_ms: NOW - 3600000,
  ended_at_ms: NOW - 3000000,
  listened_seconds: 300,
  spoken_seconds: 60,
  turn_count: 5,
  participants: ['Alice'],
};

const yesterdayCall: MeetCallRecord = {
  request_id: 'req-yesterday',
  meet_url: 'https://zoom.us/j/999888',
  bot_display_name: 'OpenHuman',
  owner_display_name: 'Bob',
  started_at_ms: NOW - 86400000 - 3600000,
  ended_at_ms: NOW - 86400000 - 3000000,
  listened_seconds: 120,
  spoken_seconds: 30,
  turn_count: 2,
  participants: ['Bob'],
};

const detail: MeetCallDetail = {
  request_id: 'req-today',
  summary: {
    headline: 'Sync meeting',
    key_points: [],
    action_items: [],
  },
  transcript: [{ role: 'participant', content: 'Hello' }],
};

describe('HistorySection', () => {
  it('shows loading state while fetching', async () => {
    listMeetCallsMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<HistorySection />);
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  it('shows empty state when no calls returned', async () => {
    listMeetCallsMock.mockResolvedValue([]);
    renderWithProviders(<HistorySection />);
    await waitFor(() => {
      // HistoryRail shows the i18n empty text when all groups have no calls
      expect(screen.getByText(/no previous calls yet|your meeting history will appear|no.*call/i)).toBeInTheDocument();
    });
  });

  it('renders grouped calls', async () => {
    listMeetCallsMock.mockResolvedValue([todayCall, yesterdayCall]);
    renderWithProviders(<HistorySection />);
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
      expect(screen.getByText('abc-def-ghi')).toBeInTheDocument();
      expect(screen.getByText('j/999888')).toBeInTheDocument();
    });
  });

  it('shows detail pane when a call is selected', async () => {
    listMeetCallsMock.mockResolvedValue([todayCall]);
    getMeetCallDetailMock.mockResolvedValue(detail);
    renderWithProviders(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText('abc-def-ghi')).toBeInTheDocument();
    });

    // Click the call row button
    const buttons = screen.getAllByRole('button');
    const callButton = buttons.find(b => b.textContent?.includes('abc-def-ghi'));
    expect(callButton).toBeDefined();
    fireEvent.click(callButton!);

    await waitFor(() => {
      expect(getMeetCallDetailMock).toHaveBeenCalledWith('req-today');
    });
  });

  it('filters calls by search query', async () => {
    listMeetCallsMock.mockResolvedValue([todayCall, yesterdayCall]);
    renderWithProviders(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText('abc-def-ghi')).toBeInTheDocument();
    });

    // Search for the Zoom meeting's code (part of the URL path)
    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: '999888' } });

    await waitFor(() => {
      expect(screen.queryByText('abc-def-ghi')).toBeNull();
      expect(screen.getByText('j/999888')).toBeInTheDocument();
    });
  });

  it('filters calls by platform', async () => {
    listMeetCallsMock.mockResolvedValue([todayCall, yesterdayCall]);
    renderWithProviders(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText('abc-def-ghi')).toBeInTheDocument();
    });

    const platformSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(platformSelect, { target: { value: 'gmeet' } });

    await waitFor(() => {
      expect(screen.getByText('abc-def-ghi')).toBeInTheDocument();
      expect(screen.queryByText('j/999888')).toBeNull();
    });
  });

  it('shows error state when listMeetCalls throws', async () => {
    listMeetCallsMock.mockRejectedValue(new Error('network error'));
    renderWithProviders(<HistorySection />);
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
