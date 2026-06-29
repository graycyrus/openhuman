/**
 * HistoryRail — the left-hand call list with search + platform filter.
 *
 * Renders date-grouped rows; each row is a button showing the platform logo,
 * meeting code, relative time, and turn count. The selected row is highlighted.
 */
import debug from 'debug';

import { useT } from '../../lib/i18n/I18nContext';
import type { MeetCallRecord, MeetingPlatform } from '../../services/meetCallService';
import { MEETING_PLATFORMS, platformLabel, platformLogoUrl } from './meetingUtils';

const log = debug('meetings:rail');

export interface CallGroup {
  label: string;
  calls: MeetCallRecord[];
}

interface HistoryRailProps {
  groups: CallGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  platformFilter: string;
  onPlatformChange: (p: string) => void;
}

function extractMeetingCode(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+/, '') || url;
  } catch {
    return url;
  }
}

function formatRelativeTime(ms: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export function HistoryRail({
  groups,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  platformFilter,
  onPlatformChange,
}: HistoryRailProps) {
  const { t } = useT();

  const totalCalls = groups.reduce((sum, g) => sum + g.calls.length, 0);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Search */}
      <input
        type="search"
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={t('skills.meetingBots.history.searchPlaceholder')}
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-content placeholder:text-content-faint focus:outline-none focus:ring-1 focus:ring-primary-400"
      />

      {/* Platform filter */}
      <select
        value={platformFilter}
        onChange={e => onPlatformChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-content focus:outline-none focus:ring-1 focus:ring-primary-400">
        <option value="">{t('skills.meetingBots.history.allPlatforms')}</option>
        {MEETING_PLATFORMS.map(p => (
          <option key={p} value={p}>
            {platformLabel(p, t)}
          </option>
        ))}
      </select>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {totalCalls === 0 && (
          <p className="text-[11px] text-content-faint px-1">
            {t('skills.meetingBots.recentCallsEmpty')}
          </p>
        )}
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-content-muted">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.calls.map(call => {
                const isSelected = call.request_id === selectedId;
                const code = extractMeetingCode(call.meet_url);
                const platform = (() => {
                  try {
                    const host = new URL(call.meet_url).hostname.toLowerCase();
                    if (host.includes('meet.google.com')) return 'gmeet' as MeetingPlatform;
                    if (host.includes('zoom.us')) return 'zoom' as MeetingPlatform;
                    if (host.includes('teams.microsoft.com')) return 'teams' as MeetingPlatform;
                    if (host.includes('webex.com')) return 'webex' as MeetingPlatform;
                    return null;
                  } catch {
                    return null;
                  }
                })();

                return (
                  <li key={call.request_id}>
                    <button
                      type="button"
                      onClick={() => {
                        log('[rail] selected call', call.request_id);
                        onSelect(call.request_id);
                      }}
                      className={[
                        'w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors',
                        isSelected
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'hover:bg-surface-muted dark:hover:bg-surface-muted/40 text-content-secondary',
                      ].join(' ')}>
                      <div className="flex items-center gap-1.5">
                        {platform && (
                          <img
                            src={platformLogoUrl(platform)}
                            alt={platformLabel(platform, t)}
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0 rounded-sm object-contain"
                          />
                        )}
                        <span className="flex-1 truncate font-mono text-[11px]">{code}</span>
                        <span className="shrink-0 text-[10px] text-content-faint">
                          {formatRelativeTime(call.started_at_ms)}
                        </span>
                      </div>
                      <div className="mt-0.5 pl-5 text-[10px] text-content-muted">
                        {t(
                          call.turn_count === 1
                            ? 'skills.meetingBots.recentCallTurnSingular'
                            : 'skills.meetingBots.recentCallTurnPlural'
                        ).replace('{count}', String(call.turn_count))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HistoryRail;
