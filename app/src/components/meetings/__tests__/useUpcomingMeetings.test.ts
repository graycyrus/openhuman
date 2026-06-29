/**
 * Tests for useUpcomingMeetings hook.
 *
 * Timer tests wrap vi.advanceTimersByTimeAsync in act() — this is the
 * established project pattern (see CoreStateProvider.test.tsx) for settling
 * async operations under fake timers without using waitFor (which uses real
 * setTimeout internally and would hang when fake timers are active).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpcomingMeetings } from '../useUpcomingMeetings';

const listMock = vi.fn();

vi.mock('../../../services/meetCallService', async () => {
  const actual = await vi.importActual<typeof import('../../../services/meetCallService')>(
    '../../../services/meetCallService'
  );
  return { ...actual, listUpcomingMeetings: (...args: unknown[]) => listMock(...args) };
});

const MEETING = {
  calendar_event_id: 'evt-1',
  title: 'Daily Standup',
  start_time_ms: Date.now() + 20 * 60 * 1000,
  end_time_ms: Date.now() + 50 * 60 * 1000,
  meet_url: 'https://meet.google.com/abc-def-ghi',
  platform: 'gmeet',
  participant_count: 3,
  organizer: 'alice@example.com',
  join_policy: 'ask',
  calendar_source: 'google:alice@example.com',
};

describe('useUpcomingMeetings', () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it('starts in loading=true, meetings=[] state', async () => {
    let resolve: (v: unknown) => void;
    listMock.mockImplementation(
      () => new Promise(r => { resolve = r; })
    );

    const { result, unmount } = renderHook(() => useUpcomingMeetings());

    expect(result.current.loading).toBe(true);
    expect(result.current.meetings).toEqual([]);
    expect(result.current.error).toBeNull();

    await act(async () => { resolve!([]); });
    unmount();
  });

  it('populates meetings on successful fetch', async () => {
    listMock.mockResolvedValueOnce([MEETING]);

    const { result, unmount } = renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meetings).toEqual([MEETING]);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('sets error when the fetch rejects', async () => {
    listMock.mockRejectedValueOnce(new Error('Network error'));

    const { result, unmount } = renderHook(() => useUpcomingMeetings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
    expect(result.current.meetings).toEqual([]);
    unmount();
  });

  it('re-fetches on refresh()', async () => {
    listMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([MEETING]);

    const { result, unmount } = renderHook(() => useUpcomingMeetings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meetings).toEqual([]);

    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.meetings).toEqual([MEETING]));
    unmount();
  });

  it('passes lookaheadMinutes and limit to the service', async () => {
    listMock.mockResolvedValueOnce([]);

    const { unmount } = renderHook(() => useUpcomingMeetings(120, 5));
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(120, 5));
    unmount();
  });

  it('polls again after 60 seconds', async () => {
    vi.useFakeTimers();
    try {
      listMock.mockResolvedValue([]);

      const { unmount } = renderHook(() => useUpcomingMeetings());

      // Flush initial fetch
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(listMock).toHaveBeenCalledTimes(1);

      // Advance 60 seconds to trigger the poll
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(listMock).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the interval on unmount', async () => {
    vi.useFakeTimers();
    try {
      listMock.mockResolvedValue([]);

      const { unmount } = renderHook(() => useUpcomingMeetings());
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(listMock).toHaveBeenCalledTimes(1);

      unmount();
      listMock.mockClear();

      // Advance past the poll interval — no further calls expected.
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(listMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
