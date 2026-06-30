/**
 * Hook: fetch and periodically refresh upcoming calendar meetings.
 *
 * Polls every 60 s so the table stays fresh without manual refresh.
 * Cleans up the poll interval on unmount and guards against setState
 * after unmount.
 */
import debug from 'debug';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listUpcomingMeetings,
  type UpcomingMeeting,
} from '../../services/meetCallService';

const log = debug('meetings:upcoming');

const POLL_INTERVAL_MS = 60_000;

export interface UseUpcomingMeetingsResult {
  meetings: UpcomingMeeting[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useUpcomingMeetings(
  lookaheadMinutes?: number,
  limit?: number
): UseUpcomingMeetingsResult {
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  /**
   * Fetch meetings from the core.
   *
   * @param showLoading - When true, sets `loading=true` before the fetch so
   *   the caller can show a skeleton. Background poll ticks pass `false` to
   *   avoid the skeleton re-appearing every 60 s; the initial mount and the
   *   manual refresh button pass `true`.
   */
  const fetchMeetings = useCallback(async (showLoading: boolean) => {
    log('[useUpcomingMeetings] fetching upcoming meetings showLoading=%s', showLoading);
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await listUpcomingMeetings(lookaheadMinutes, limit);
      if (!mountedRef.current) return;
      log('[useUpcomingMeetings] fetched %d meetings', data.length);
      setMeetings(data);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      log('[useUpcomingMeetings] fetch error: %s', msg);
      setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [lookaheadMinutes, limit]);

  useEffect(() => {
    mountedRef.current = true;
    // Initial load: show the skeleton.
    fetchMeetings(true);

    const id = setInterval(() => {
      log('[useUpcomingMeetings] poll tick');
      // Background refresh: no skeleton to avoid table flicker every 60 s.
      fetchMeetings(false);
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchMeetings]);

  // Manual refresh (the refresh button) shows the loading state so the user
  // gets clear visual feedback that data is being reloaded.
  return { meetings, loading, error, refresh: () => fetchMeetings(true) };
}
