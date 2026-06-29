/**
 * HistoryDetail — shows the full detail for a selected call: header metadata,
 * summary (action items + key points + headline), and the transcript.
 *
 * When no record is selected, renders a placeholder prompt.
 * Lazy-loads the detail via getMeetCallDetail on each new request_id.
 * Re-fetches once after 2 s if the loaded detail has no summary yet
 * (the summary is generated asynchronously at call-end).
 */
import debug from 'debug';
import { useEffect, useRef, useState } from 'react';

import { useT } from '../../lib/i18n/I18nContext';
import {
  getMeetCallDetail,
  type MeetCallDetail,
  type MeetCallRecord,
} from '../../services/meetCallService';
import { inferPlatformFromUrl, platformLabel, platformLogoUrl } from './meetingUtils';
import ActionItemChecklist from './ActionItemChecklist';
import TranscriptViewer from './TranscriptViewer';

const log = debug('meetings:detail');

type DetailStatus = 'idle' | 'loading' | 'loaded' | 'error';

function hasSummaryDetail(detail: MeetCallDetail | null): boolean {
  const summary = detail?.summary;
  return (
    !!summary &&
    (summary.headline.trim().length > 0 ||
      summary.key_points.length > 0 ||
      summary.action_items.length > 0)
  );
}

function extractMeetingCode(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+/, '') || url;
  } catch {
    return url;
  }
}

interface HistoryDetailProps {
  record: MeetCallRecord | null;
}

export function HistoryDetail({ record }: HistoryDetailProps) {
  const { t } = useT();
  const [status, setStatus] = useState<DetailStatus>('idle');
  const [detail, setDetail] = useState<MeetCallDetail | null>(null);
  // Track which request_id we've loaded so we can reset on change
  const loadedForRef = useRef<string | null>(null);

  async function loadDetail(requestId: string) {
    log('[detail] loading detail for', requestId);
    setStatus('loading');
    try {
      const result = await getMeetCallDetail(requestId);
      log('[detail] loaded detail for', requestId, 'hasSummary=%s', hasSummaryDetail(result));
      setDetail(result);
      setStatus('loaded');
      loadedForRef.current = requestId;
    } catch (err) {
      log('[detail] error loading detail for', requestId, err);
      setStatus('error');
    }
  }

  useEffect(() => {
    if (!record) {
      setStatus('idle');
      setDetail(null);
      loadedForRef.current = null;
      return;
    }

    // Reset and load when the selected call changes
    setStatus('idle');
    setDetail(null);
    loadedForRef.current = null;
    void loadDetail(record.request_id);
  }, [record?.request_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // If loaded but no summary yet, retry once after 2 s
  useEffect(() => {
    if (status !== 'loaded' || !record) return;
    if (hasSummaryDetail(detail)) return;

    log('[detail] no summary yet, scheduling retry in 2000ms for', record.request_id);
    const timer = setTimeout(() => {
      log('[detail] retrying detail load for', record.request_id);
      void loadDetail(record.request_id);
    }, 2000);
    return () => clearTimeout(timer);
  }, [status, detail, record?.request_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!record) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-[12px] text-content-faint text-center">
          {t('skills.meetingBots.history.selectPrompt')}
        </p>
      </div>
    );
  }

  const meetingCode = extractMeetingCode(record.meet_url);
  const platform = inferPlatformFromUrl(record.meet_url);
  const logoUrl = platform ? platformLogoUrl(platform) : null;
  const platformName = platform ? platformLabel(platform, t) : null;
  const startTime = new Date(record.started_at_ms).toLocaleString();
  const duration = Math.max(0, Math.round(record.spoken_seconds + record.listened_seconds));
  const participants = (record.participants ?? []).map(p => p.trim()).filter(Boolean);

  return (
    <div className="space-y-4 p-2">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={platformName ?? ''}
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 rounded-sm object-contain"
            />
          )}
          <span className="font-mono text-[12px] font-medium text-content truncate">
            {meetingCode}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-content-muted">
          <span>{startTime}</span>
          <span>
            {t('skills.meetingBots.recentCallDuration').replace('{seconds}', String(duration))}
          </span>
          {record.owner_display_name?.trim() && (
            <span>
              {t('skills.meetingBots.recentCallAddedBy').replace(
                '{name}',
                record.owner_display_name.trim()
              )}
            </span>
          )}
        </div>
        {participants.length > 0 && (
          <p className="text-[11px] text-content-muted">
            {participants.length === 1
              ? t('skills.meetingBots.history.participantCount').replace(
                  '{count}',
                  String(participants.length)
                )
              : t('skills.meetingBots.history.participantCountPlural').replace(
                  '{count}',
                  String(participants.length)
                )}
            {': '}
            {participants.join(', ')}
          </p>
        )}
      </div>

      {/* Detail body */}
      {(status === 'idle' || status === 'loading') && (
        <p className="text-[11px] text-content-faint">
          {t('skills.meetingBots.callDetailLoading')}
        </p>
      )}

      {status === 'error' && (
        <p className="text-[11px] text-coral-600 dark:text-coral-400">
          {t('skills.meetingBots.callDetailError')}{' '}
          <button
            type="button"
            onClick={() => void loadDetail(record.request_id)}
            className="underline underline-offset-2 hover:text-coral-700 dark:hover:text-coral-300">
            {t('skills.meetingBots.callDetailRetry')}
          </button>
        </p>
      )}

      {status === 'loaded' && !hasSummaryDetail(detail) && (detail?.transcript ?? []).length === 0 && (
        <p className="text-[11px] text-content-faint">
          {t('skills.meetingBots.callDetailEmpty')}
        </p>
      )}

      {status === 'loaded' && (hasSummaryDetail(detail) || (detail?.transcript ?? []).length > 0) && (
        <div className="space-y-4">
          {hasSummaryDetail(detail) && detail?.summary && (
            <div className="space-y-2">
              {detail.summary.headline.trim() && (
                <p className="text-[12px] text-content-secondary">{detail.summary.headline}</p>
              )}
              {detail.summary.key_points.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-content-muted">
                    {t('skills.meetingBots.callKeyPointsHeading')}
                  </p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-content-secondary">
                    {detail.summary.key_points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.summary.action_items.length > 0 && (
                <ActionItemChecklist items={detail.summary.action_items} />
              )}
            </div>
          )}
          {(detail?.transcript ?? []).length > 0 && (
            <TranscriptViewer lines={detail!.transcript} />
          )}
        </div>
      )}
    </div>
  );
}

export default HistoryDetail;
