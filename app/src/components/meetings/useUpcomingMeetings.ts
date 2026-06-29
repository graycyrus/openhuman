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

  const fetchMeetings = useCallback(async () => {
    log('[useUpcomingMeetings] fetching upcoming meetings');
    setLoading(true);
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
    fetchMeetings();

    const id = setInterval(() => {
      log('[useUpcomingMeetings] poll tick');
      fetchMeetings();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchMeetings]);

  return { meetings, loading, error, refresh: fetchMeetings };
}
