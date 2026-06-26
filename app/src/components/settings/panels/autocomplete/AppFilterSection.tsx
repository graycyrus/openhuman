import { useT } from '../../../../lib/i18n/I18nContext';
import type { AutocompleteStatus } from '../../../../utils/tauriCommands';
import Button from '../../../ui/Button';
import { SettingsRow, SettingsSection, SettingsStatusLine, SettingsTextArea } from '../../controls';

interface AppFilterSectionProps {
  status: AutocompleteStatus | null;
  isLoading: boolean;
  contextOverride: string;
  focusDebug: string;
  logs: string[];
  message: string | null;
  error: string | null;
  onSetContextOverride: (value: string) => void;
  onRefreshStatus: () => void;
  onStart: () => void;
  onStop: () => void;
  onTestCurrent: () => void;
  onAcceptSuggestion: () => void;
  onDebugFocus: () => void;
  onClearLogs: () => void;
}

const AppFilterSection = ({
  status,
  isLoading,
  contextOverride,
  focusDebug,
  logs,
  message,
  error,
  onSetContextOverride,
  onRefreshStatus,
  onStart,
  onStop,
  onTestCurrent,
  onAcceptSuggestion,
  onDebugFocus,
  onClearLogs,
}: AppFilterSectionProps) => {
  const { t } = useT();
  return (
    <>
      <SettingsSection title={t('settings.autocomplete.appFilter.runtime')}>
        <div className="space-y-1 px-4 py-3 text-sm text-neutral-800 dark:text-neutral-200">
          <div>
            {t('settings.autocomplete.appFilter.platformSupported')}:{' '}
            {status?.platform_supported ? t('common.yes') : t('common.no')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.enabled')}:{' '}
            {status?.enabled ? t('common.yes') : t('common.no')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.running')}:{' '}
            {status?.running ? t('common.yes') : t('common.no')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.phase')}:{' '}
            {status?.phase ?? t('settings.autocomplete.shared.unknown')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.debounce')}:{' '}
            {`${String(status?.debounce_ms ?? 0)}ms`}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.model')}:{' '}
            {status?.model_id ?? t('settings.autocomplete.shared.notApplicable')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.app')}:{' '}
            {status?.app_name ?? t('settings.autocomplete.shared.notApplicable')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.lastError')}:{' '}
            {status?.last_error ?? t('settings.autocomplete.shared.none')}
          </div>
          <div>
            {t('settings.autocomplete.appFilter.currentSuggestion')}:{' '}
            {status?.suggestion?.value ?? t('settings.autocomplete.shared.none')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onRefreshStatus} disabled={isLoading}>
            {isLoading
              ? t('settings.autocomplete.appFilter.refreshing')
              : t('settings.autocomplete.appFilter.refreshStatus')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onStart}
            disabled={!status?.platform_supported || Boolean(status?.running)}>
            {t('autocomplete.start')}
          </Button>
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            onClick={onStop}
            disabled={!status?.running}>
            {t('autocomplete.stop')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.autocomplete.appFilter.test')}>
        <SettingsRow
          stacked
          htmlFor="app-filter-context-override"
          label={t('settings.autocomplete.appFilter.contextOverride')}
          control={
            <SettingsTextArea
              id="app-filter-context-override"
              value={contextOverride}
              onChange={event => onSetContextOverride(event.target.value)}
              rows={3}
            />
          }
        />
        <div className="flex flex-wrap gap-2 px-4 py-3">
          <Button variant="primary" size="sm" onClick={onTestCurrent}>
            {t('settings.autocomplete.appFilter.getSuggestion')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onAcceptSuggestion}>
            {t('settings.autocomplete.appFilter.acceptSuggestion')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onDebugFocus}>
            {t('settings.autocomplete.appFilter.debugFocus')}
          </Button>
        </div>
        {focusDebug && (
          <div className="px-4 py-3">
            <pre className="max-h-48 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 p-2 text-xs text-neutral-800 dark:text-neutral-200">
              {focusDebug}
            </pre>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.autocomplete.appFilter.liveLogs')}>
        <div className="flex justify-end px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClearLogs}>
            {t('common.clear')}
          </Button>
        </div>
        <div className="px-4 py-3">
          <pre className="max-h-56 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 p-2 text-xs text-neutral-800 dark:text-neutral-200">
            {logs.length > 0 ? logs.join('\n') : t('settings.autocomplete.appFilter.noLogs')}
          </pre>
        </div>
      </SettingsSection>

      <SettingsStatusLine
        saving={false}
        savedNote={message}
        error={error}
        savingLabel={t('common.loading')}
      />
    </>
  );
};

export default AppFilterSection;
