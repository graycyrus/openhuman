/**
 * MeetDefaultsDrawer — slide-over drawer for global and per-platform meeting defaults.
 *
 * Opened via the gear button in MeetingsPage. Uses the same settings primitives
 * (SettingsSection / SettingsRow / SettingsSelect / SettingsSwitch) as
 * MeetingSettingsPanel. Saves via the existing config_update_meet_settings RPC.
 */
import debug from 'debug';
import { useEffect, useRef, useState } from 'react';

import { useT } from '../../lib/i18n/I18nContext';
import {
  isTauri,
  type MeetAutoJoinPolicy,
  type MeetAutoSummarizePolicy,
  openhumanGetMeetSettings,
  openhumanUpdateMeetSettings,
} from '../../utils/tauriCommands';
import {
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsStatusLine,
  SettingsSwitch,
} from '../settings/controls';

const log = debug('meetings:defaults-drawer');

export interface MeetDefaultsDrawerProps {
  open: boolean;
  onClose: () => void;
}

// Platform slugs in display order
const PLATFORMS: Array<{ key: string; labelKey: string }> = [
  { key: 'gmeet', labelKey: 'skills.meetingBots.platforms.gmeet' },
  { key: 'zoom', labelKey: 'skills.meetingBots.platforms.zoom' },
  { key: 'teams', labelKey: 'skills.meetingBots.platforms.teams' },
  { key: 'webex', labelKey: 'skills.meetingBots.platforms.webex' },
];

// Values for global auto-join select
const AUTO_JOIN_OPTIONS: MeetAutoJoinPolicy[] = ['ask_each_time', 'always', 'never'];
// Values for per-platform override (includes "default" meaning: use global)
type PlatformPolicy = MeetAutoJoinPolicy | 'default';
const PLATFORM_OPTIONS: PlatformPolicy[] = ['default', 'ask_each_time', 'always', 'never'];

const AUTO_JOIN_LABEL_KEY: Record<MeetAutoJoinPolicy, string> = {
  ask_each_time: 'settings.meetings.autoJoin.askEachTime',
  always: 'settings.meetings.autoJoin.always',
  never: 'settings.meetings.autoJoin.never',
};

const AUTO_SUMMARIZE_OPTIONS: MeetAutoSummarizePolicy[] = ['ask', 'always', 'never'];
const AUTO_SUMMARIZE_LABEL_KEY: Record<MeetAutoSummarizePolicy, string> = {
  ask: 'settings.meetings.autoSummarize.ask',
  always: 'settings.meetings.autoSummarize.always',
  never: 'settings.meetings.autoSummarize.never',
};

export function MeetDefaultsDrawer({ open, onClose }: MeetDefaultsDrawerProps) {
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // Global settings
  const [autoJoin, setAutoJoin] = useState<MeetAutoJoinPolicy>('ask_each_time');
  const [autoSummarize, setAutoSummarize] = useState<MeetAutoSummarizePolicy>('ask');
  const [listenOnly, setListenOnly] = useState(true);
  const [ingestTranscripts, setIngestTranscripts] = useState(false);

  // Per-platform overrides: key → MeetAutoJoinPolicy | undefined (undefined = use default)
  const [platformPolicies, setPlatformPolicies] = useState<Record<string, PlatformPolicy>>({});

  const persistSeqRef = useRef(0);

  // Load settings when opened
  useEffect(() => {
    if (!open) return;
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      log('load start');
      try {
        const resp = await openhumanGetMeetSettings();
        if (cancelled) return;
        const s = resp.result;
        log('load ok auto_join=%s', s.auto_join_policy);
        setAutoJoin(s.auto_join_policy);
        setAutoSummarize(s.auto_summarize_policy);
        setListenOnly(s.listen_only_default);
        setIngestTranscripts(s.ingest_backend_transcripts);
        // Build per-platform state: stored as "ask_each_time"|"always"|"never", display as that or "default"
        const pp: Record<string, PlatformPolicy> = {};
        const stored = s.platform_auto_join_policies ?? {};
        for (const plat of PLATFORMS.map(p => p.key)) {
          pp[plat] = (stored[plat] as MeetAutoJoinPolicy | undefined) ?? 'default';
        }
        setPlatformPolicies(pp);
      } catch (e) {
        log('load failed err=%o', e);
        if (!cancelled) setError(e instanceof Error ? e.message : t('settings.meetings.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const persist = async (
    patch: Parameters<typeof openhumanUpdateMeetSettings>[0],
    onFailure?: () => void
  ) => {
    const seq = ++persistSeqRef.current;
    if (!isTauri()) return;
    log('persist patch=%o', patch);
    setError(null);
    setSavedNote(null);
    setSaving(true);
    try {
      await openhumanUpdateMeetSettings(patch);
      if (seq !== persistSeqRef.current) return;
      setSavedNote(t('settings.meetings.saved'));
    } catch (e) {
      if (seq !== persistSeqRef.current) return;
      onFailure?.();
      setError(e instanceof Error ? e.message : t('settings.meetings.saveError'));
    } finally {
      if (seq === persistSeqRef.current) setSaving(false);
    }
  };

  const handleAutoJoinChange = (next: MeetAutoJoinPolicy) => {
    const prev = autoJoin;
    setAutoJoin(next);
    void persist({ auto_join_policy: next }, () => setAutoJoin(prev));
  };

  const handleAutoSummarizeChange = (next: MeetAutoSummarizePolicy) => {
    const prev = autoSummarize;
    setAutoSummarize(next);
    void persist({ auto_summarize_policy: next }, () => setAutoSummarize(prev));
  };

  const handleListenOnlyChange = (next: boolean) => {
    const prev = listenOnly;
    setListenOnly(next);
    void persist({ listen_only_default: next }, () => setListenOnly(prev));
  };

  const handleIngestChange = (next: boolean) => {
    const prev = ingestTranscripts;
    setIngestTranscripts(next);
    void persist({ ingest_backend_transcripts: next }, () => setIngestTranscripts(prev));
  };

  const handlePlatformPolicyChange = (platform: string, next: PlatformPolicy) => {
    const prevValue = platformPolicies[platform] ?? 'default';
    const updated = { ...platformPolicies, [platform]: next };
    setPlatformPolicies(updated);

    // Build the map to persist: only include non-"default" entries
    const toSave: Record<string, MeetAutoJoinPolicy> = {};
    for (const [k, v] of Object.entries(updated)) {
      if (v !== 'default') {
        toSave[k] = v as MeetAutoJoinPolicy;
      }
    }
    void persist(
      { platform_auto_join_policies: toSave },
      () => setPlatformPolicies(current => ({ ...current, [platform]: prevValue }))
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('skills.meetingBots.defaults.drawerTitle')}
        className="fixed inset-y-0 right-0 z-50 w-80 bg-surface border-l border-line/50 flex flex-col shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line/50 shrink-0">
          <h2 className="text-sm font-semibold text-content-primary">
            {t('skills.meetingBots.defaults.drawerTitle')}
          </h2>
          <button
            type="button"
            aria-label={t('skills.meetingBots.defaults.closeDrawer')}
            onClick={onClose}
            className="text-content-secondary hover:text-content-primary transition-colors p-1 rounded"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <p className="text-sm text-content-secondary">{t('settings.meetings.loading')}</p>
          ) : !isTauri() ? (
            <p className="text-sm text-content-secondary">{t('settings.meetings.desktopOnly')}</p>
          ) : (
            <>
              {/* Global auto-join */}
              <SettingsSection title={t('skills.meetingBots.defaults.globalPolicy')}>
                <SettingsRow
                  stacked
                  control={
                    <SettingsSelect
                      value={autoJoin}
                      onChange={e => handleAutoJoinChange(e.target.value as MeetAutoJoinPolicy)}
                      aria-label={t('skills.meetingBots.defaults.globalPolicy')}
                    >
                      {AUTO_JOIN_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {t(AUTO_JOIN_LABEL_KEY[opt])}
                        </option>
                      ))}
                    </SettingsSelect>
                  }
                />
              </SettingsSection>

              {/* Per-platform overrides */}
              <SettingsSection
                title={t('skills.meetingBots.defaults.perPlatformTitle')}
                description={t('skills.meetingBots.defaults.perPlatformDesc')}
              >
                {PLATFORMS.map(({ key, labelKey }) => (
                  <SettingsRow
                    key={key}
                    label={t(labelKey)}
                    control={
                      <SettingsSelect
                        value={platformPolicies[key] ?? 'default'}
                        onChange={e =>
                          handlePlatformPolicyChange(key, e.target.value as PlatformPolicy)
                        }
                        aria-label={t(labelKey)}
                      >
                        {PLATFORM_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>
                            {opt === 'default'
                              ? t('skills.meetingBots.defaults.useDefault')
                              : t(AUTO_JOIN_LABEL_KEY[opt as MeetAutoJoinPolicy])}
                          </option>
                        ))}
                      </SettingsSelect>
                    }
                  />
                ))}
              </SettingsSection>

              {/* Other toggles */}
              <SettingsSection>
                <SettingsRow
                  htmlFor="drawer-switch-listen-only"
                  label={t('settings.meetings.listenOnly')}
                  description={t('settings.meetings.listenOnlyDesc')}
                  control={
                    <SettingsSwitch
                      id="drawer-switch-listen-only"
                      checked={listenOnly}
                      onCheckedChange={handleListenOnlyChange}
                      aria-label={t('settings.meetings.listenOnly')}
                    />
                  }
                />
                <SettingsRow
                  htmlFor="drawer-switch-auto-summarize"
                  label={t('settings.meetings.autoSummarize.title')}
                  control={
                    <SettingsSelect
                      value={autoSummarize}
                      onChange={e =>
                        handleAutoSummarizeChange(e.target.value as MeetAutoSummarizePolicy)
                      }
                      aria-label={t('settings.meetings.autoSummarize.title')}
                    >
                      {AUTO_SUMMARIZE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {t(AUTO_SUMMARIZE_LABEL_KEY[opt])}
                        </option>
                      ))}
                    </SettingsSelect>
                  }
                />
                <SettingsRow
                  htmlFor="drawer-switch-ingest"
                  label={t('settings.meetings.ingestTranscripts')}
                  description={t('settings.meetings.ingestTranscriptsDesc')}
                  control={
                    <SettingsSwitch
                      id="drawer-switch-ingest"
                      checked={ingestTranscripts}
                      onCheckedChange={handleIngestChange}
                      aria-label={t('settings.meetings.ingestTranscripts')}
                    />
                  }
                />
              </SettingsSection>
            </>
          )}
        </div>

        {/* Status line */}
        <div className="px-4 py-2 border-t border-line/50 shrink-0">
          <SettingsStatusLine
            saving={saving}
            savedNote={savedNote}
            error={error}
            savingLabel={t('settings.meetings.saving')}
          />
        </div>
      </div>
    </>
  );
}
