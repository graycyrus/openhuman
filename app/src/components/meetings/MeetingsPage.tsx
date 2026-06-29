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
import { useEffect, useRef } from 'react';

import { selectBackendMeetStatus } from '../../store/backendMeetSlice';
import { useAppSelector } from '../../store/hooks';
import { useT } from '../../lib/i18n/I18nContext';
import BetaBanner from '../ui/BetaBanner';
import { ActiveMeetingBanner } from './ActiveMeetingBanner';
import HistorySection from './HistorySection';
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

  return (
    <div className="space-y-3 animate-fade-up">
      <BetaBanner />

      {showActive ? (
        <ActiveMeetingBanner onToast={onToast} />
      ) : (
        <MeetComposer onToast={onToast} hasSubmittedRef={hasSubmittedRef} />
      )}

      <HistorySection />
    </div>
  );
}
