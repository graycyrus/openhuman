import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import type { MeetCallRecord, MeetCallDetail } from '../../../services/meetCallService';
import HistoryDetail from '../HistoryDetail';

const getMeetCallDetailMock = vi.fn();

vi.mock('../../../services/meetCallService', async () => {
  const actual = await vi.importActual<typeof import('../../../services/meetCallService')>(
    '../../../services/meetCallService'
  );
  return {
    ...actual,
    getMeetCallDetail: (...args: unknown[]) => getMeetCallDetailMock(...args),
  };
});

// Also mock ActionItemChecklist and TranscriptViewer for isolation
vi.mock('../ActionItemChecklist', () => ({
  default: ({ items }: { items: unknown[] }) => (
    <div data-testid="action-items">action-items:{items.length}</div>
  ),
  ActionItemChecklist: ({ items }: { items: unknown[] }) => (
    <div data-testid="action-items">action-items:{items.length}</div>
  ),
}));

vi.mock('../TranscriptViewer', () => ({
  default: ({ lines }: { lines: unknown[] }) => (
    <div data-testid="transcript">transcript:{lines.length}</div>
  ),
  TranscriptViewer: ({ lines }: { lines: unknown[] }) => (
    <div data-testid="transcript">transcript:{lines.length}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const record: MeetCallRecord = {
  request_id: 'req-1',
  meet_url: 'https://meet.google.com/abc-def-ghi',
  bot_display_name: 'OpenHuman',
  owner_display_name: 'Alice',
  started_at_ms: 1700000000000,
  ended_at_ms: 1700000600000,
  listened_seconds: 300,
  spoken_seconds: 300,
  turn_count: 5,
  participants: ['Alice', 'Bob'],
};

const detailWithSummary: MeetCallDetail = {
  request_id: 'req-1',
  summary: {
    headline: 'Great meeting',
    key_points: ['Point 1', 'Point 2'],
    action_items: [
      { description: 'Do something', kind: 'executable', tool_name: 'calendar', assignee: 'Alice' },
    ],
  },
  transcript: [
    { role: 'participant', content: '[0:01] [Alice] Hello' },
    { role: 'assistant', content: 'Hi there' },
  ],
};

const detailNoSummary: MeetCallDetail = {
  request_id: 'req-1',
  summary: null,
  transcript: [{ role: 'participant', content: 'Plain transcript line' }],
};

describe('HistoryDetail', () => {
  it('shows select prompt when record is null', () => {
    renderWithProviders(<HistoryDetail record={null} />);
    expect(
      screen.getByText('Select a call to see its summary and transcript.')
    ).toBeInTheDocument();
  });

  it('shows loading state while detail is being fetched', async () => {
    // Never resolve
    getMeetCallDetailMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<HistoryDetail record={record} />);
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  it('renders summary and transcript on success', async () => {
    getMeetCallDetailMock.mockResolvedValue(detailWithSummary);
    renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => {
      expect(screen.getByTestId('action-items')).toBeInTheDocument();
      expect(screen.getByTestId('transcript')).toBeInTheDocument();
    });
  });

  it('renders key points and headline from summary', async () => {
    getMeetCallDetailMock.mockResolvedValue(detailWithSummary);
    renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => {
      expect(screen.getByText('Great meeting')).toBeInTheDocument();
      expect(screen.getByText('Point 1')).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails', async () => {
    getMeetCallDetailMock.mockRejectedValue(new Error('network error'));
    renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => {
      expect(screen.getByText(/retry/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when detail has no summary or transcript', async () => {
    const emptyDetail: MeetCallDetail = {
      request_id: 'req-1',
      summary: null,
      transcript: [],
    };
    getMeetCallDetailMock.mockResolvedValue(emptyDetail);
    renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => {
      expect(screen.getByText(/nothing captured|no transcript|nothing|empty/i)).toBeInTheDocument();
    });
  });

  it('renders meeting code from URL', async () => {
    getMeetCallDetailMock.mockResolvedValue(detailWithSummary);
    renderWithProviders(<HistoryDetail record={record} />);
    // meeting code = pathname stripped of leading slash
    expect(screen.getByText('abc-def-ghi')).toBeInTheDocument();
  });

  it('renders participant count', async () => {
    getMeetCallDetailMock.mockResolvedValue(detailWithSummary);
    renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => {
      expect(screen.getByText(/2 participants/)).toBeInTheDocument();
    });
  });

  it('shows transcript without summary when summary is null', async () => {
    getMeetCallDetailMock.mockResolvedValue(detailNoSummary);
    renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => {
      expect(screen.getByTestId('transcript')).toBeInTheDocument();
      expect(screen.queryByTestId('action-items')).toBeNull();
    });
  });

  it('reloads when record changes', async () => {
    getMeetCallDetailMock.mockResolvedValue(detailWithSummary);
    const { rerender } = renderWithProviders(<HistoryDetail record={record} />);
    await waitFor(() => expect(getMeetCallDetailMock).toHaveBeenCalledTimes(1));

    const record2: MeetCallRecord = { ...record, request_id: 'req-2' };
    getMeetCallDetailMock.mockResolvedValue({ ...detailWithSummary, request_id: 'req-2' });
    rerender(<HistoryDetail record={record2} />);
    await waitFor(() => expect(getMeetCallDetailMock).toHaveBeenCalledWith('req-2'));
  });
});
