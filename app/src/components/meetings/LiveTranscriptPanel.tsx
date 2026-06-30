/**
 * LiveTranscriptPanel — renders meeting transcript turns as they stream in
 * during an active call (issue #4304).
 *
 * Fed by the `liveTranscript` buffer in `backendMeetSlice`, which accumulates
 * `agent_meetings:transcript_delta` events. The line at `partialIndex` is shown
 * greyed/italic until the backend finalizes it. The list autoscrolls to the
 * newest turn. On call end the buffer is reconciled away (the authoritative
 * final transcript takes over), so this panel naturally empties.
 */
import debug from 'debug';
import { useEffect, useRef } from 'react';

import { useT } from '../../lib/i18n/I18nContext';
import type { BackendMeetTurn } from '../../store/backendMeetSlice';

const log = debug('meetings:live-transcript');

export interface LiveTranscriptPanelProps {
  turns: BackendMeetTurn[];
  partialIndex: number | null;
}

export function LiveTranscriptPanel({ turns, partialIndex }: LiveTranscriptPanelProps) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Autoscroll to the newest turn whenever the buffer grows or the tail line
  // is updated (partial → final, or partial text extended).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    log('[live-transcript] autoscroll turns=%d partialIndex=%o', turns.length, partialIndex);
  }, [turns.length, partialIndex, turns]);

  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-coral-500 animate-pulse" aria-hidden="true" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
          {t('skills.meetingBots.liveTranscriptHeading')}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="max-h-40 overflow-y-auto rounded-md bg-surface-muted/70 p-2 space-y-0.5"
        aria-live="polite">
        {turns.length === 0 ? (
          <p className="text-[10px] italic text-content-faint">
            {t('skills.meetingBots.liveTranscriptEmpty')}
          </p>
        ) : (
          turns.map((turn, i) => {
            const isAssistant = turn.role === 'assistant';
            const isPartial = i === partialIndex;
            return (
              <p
                key={i}
                className={[
                  'text-[10px]',
                  isAssistant ? 'text-primary-600 dark:text-primary-400' : 'text-content-secondary',
                  isPartial ? 'italic text-content-faint' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}>
                <span className="mr-1 font-medium capitalize">{turn.role}:</span>
                {turn.content}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}

export default LiveTranscriptPanel;
