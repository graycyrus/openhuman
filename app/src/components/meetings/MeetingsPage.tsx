/**
 * Meetings page orchestrator.
 *
 * Renders the Beta banner, the active-meeting overlay (when a bot is running),
 * the meeting composer (when idle), and the recent-calls history below.
 *
 * Owns the `hasSubmittedRef` success-toast pattern — the ref lives here so the
 * toast fires reliably even though the inline composer unmounts when status
 * flips to 'active' (same pattern as the original `MeetingBotsCard`).
 */
import debug from 'debug';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listMeetCalls, type MeetCallRecord } from '../../services/meetCallService';
import { selectBackendMeetStatus } from '../../store/backendMeetSlice';
import { useAppSelector } from '../../store/hooks';
import { useT } from '../../lib/i18n/I18nContext';
import BetaBanner from '../ui/BetaBanner';
import { RecentCallsSection } from '../skills/RecentCallsSection';
import { ActiveMeetingBanner } from './ActiveMeetingBanner';
import { MeetComposer } from './MeetComposer';

const log = debug('meetings:page');

type Toast = { type: 'success' | 'error' | 'info'; title: string; message?: string };

export interface MeetingsPageProps {
  onToast?: (toast: Toast) => void;
}

export default function MeetingsPage({ onToast }: MeetingsPageProps) {
  const { t } = useT();
  const status = useAppSelector(selectBackendMeetStatus);
  // Show the live banner while joining or in an active meeting. All other
  // states ('idle', 'ended', 'error') render the composer so the user can
  // submit a new join or see the inline error from a failed attempt.
  const showActive = status === 'joining' || status === 'active';

  // `hasSubmittedRef` lives in this always-mounted parent so the success toast
  // fires reliably. When a join succeeds, `status` flips to 'active' and this
  // component swaps `MeetComposer` → `ActiveMeetingBanner`, unmounting the
  // composer before any effect inside it could observe 'active'. The composer
  // sets this ref on submit; we fire the success toast here.
  const hasSubmittedRef = useRef(false);
  useEffect(() => {
    if (!hasSubmittedRef.current) return;
    if (status === 'active') {
      hasSubmittedRef.current = false;
      log('[page] join succeeded → status=active, firing success toast');
      onToast?.({
        type: 'success',
        title: t('skills.meetingBots.joiningTitle'),
        message: t('skills.meetingBots.joiningMessage'),
      });
    }
  }, [status, onToast, t]);

  // ── Recent calls ─────────────────────────────────────────────────────────
  const [recentCalls, setRecentCalls] = useState<MeetCallRecord[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  const refreshRecentCalls = useCallback(async () => {
    setRecentError(null);
    try {
      const rows = await listMeetCalls(20);
      log('[page] loaded %d recent calls', rows.length);
      setRecentCalls(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load recent calls.';
      console.warn('[meetings] listMeetCalls failed:', err);
      setRecentError(message);
      setRecentCalls([]);
    }
  }, []);

  useEffect(() => {
    void refreshRecentCalls();
    // The core writes the call record asynchronously a few ms after the
    // transcript arrives — so the mount-time fetch can race ahead of that
    // write. A couple of short delayed re-fetches reliably reflect it.
    const retries = [1200, 3000].map(delay =>
      setTimeout(() => void refreshRecentCalls(), delay)
    );
    return () => retries.forEach(clearTimeout);
  }, [refreshRecentCalls]);

  return (
    <div className="space-y-3 animate-fade-up">
      <BetaBanner />

      {showActive ? (
        <ActiveMeetingBanner onToast={onToast} />
      ) : (
        <MeetComposer onToast={onToast} hasSubmittedRef={hasSubmittedRef} />
      )}

      <RecentCallsSection rows={recentCalls} error={recentError} />
    </div>
  );
}
