import { useT } from '../../../../lib/i18n/I18nContext';
import type { AcceptedCompletion } from '../../../../utils/tauriCommands';
import Button from '../../../ui/Button';
import {
  SettingsNumberField,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextArea,
} from '../../controls';

interface CompletionStyleSectionProps {
  enabled: boolean;
  debounceMs: string;
  maxChars: string;
  stylePreset: string;
  styleInstructions: string;
  styleExamplesText: string;
  disabledAppsText: string;
  acceptWithTab: boolean;
  overlayTtlMs: string;
  isSaving: boolean;
  historyEntries: AcceptedCompletion[];
  isHistoryLoading: boolean;
  isClearingHistory: boolean;
  onSetEnabled: (value: boolean) => void;
  onSetDebounceMs: (value: string) => void;
  onSetMaxChars: (value: string) => void;
  onSetStylePreset: (value: string) => void;
  onSetStyleInstructions: (value: string) => void;
  onSetStyleExamplesText: (value: string) => void;
  onSetDisabledAppsText: (value: string) => void;
  onSetAcceptWithTab: (value: boolean) => void;
  onSetOverlayTtlMs: (value: string) => void;
  onSaveConfig: () => void;
  onClearHistory: () => void;
}

const CompletionStyleSection = ({
  enabled,
  debounceMs,
  maxChars,
  stylePreset,
  styleInstructions,
  styleExamplesText,
  disabledAppsText,
  acceptWithTab,
  overlayTtlMs,
  isSaving,
  historyEntries,
  isHistoryLoading,
  isClearingHistory,
  onSetEnabled,
  onSetDebounceMs,
  onSetMaxChars,
  onSetStylePreset,
  onSetStyleInstructions,
  onSetStyleExamplesText,
  onSetDisabledAppsText,
  onSetAcceptWithTab,
  onSetOverlayTtlMs,
  onSaveConfig,
  onClearHistory,
}: CompletionStyleSectionProps) => {
  const { t } = useT();
  return (
    <>
      <SettingsSection title={t('autocomplete.settings')}>
        <SettingsRow
          label={t('settings.autocomplete.completionStyle.enabled')}
          control={
            <SettingsSwitch
              id="completion-style-enabled"
              checked={enabled}
              onCheckedChange={onSetEnabled}
              aria-label={t('settings.autocomplete.completionStyle.enabled')}
            />
          }
        />
        <SettingsRow
          label={t('autocomplete.acceptWithTab')}
          control={
            <SettingsSwitch
              id="completion-style-accept-tab"
              checked={acceptWithTab}
              onCheckedChange={onSetAcceptWithTab}
              aria-label={t('autocomplete.acceptWithTab')}
            />
          }
        />
        <SettingsRow
          label={t('settings.autocomplete.completionStyle.debounce')}
          control={
            <SettingsNumberField
              id="completion-style-debounce"
              value={debounceMs}
              onChange={onSetDebounceMs}
              onCommit={onSaveConfig}
              unit="ms"
              min={50}
              max={2000}
              step={10}
              aria-label={t('settings.autocomplete.completionStyle.debounce')}
            />
          }
        />
        <SettingsRow
          label={t('settings.autocomplete.completionStyle.maxChars')}
          control={
            <SettingsNumberField
              id="completion-style-max-chars"
              value={maxChars}
              onChange={onSetMaxChars}
              onCommit={onSaveConfig}
              min={32}
              max={1200}
              step={8}
              aria-label={t('settings.autocomplete.completionStyle.maxChars')}
            />
          }
        />
        <SettingsRow
          label={t('settings.autocomplete.completionStyle.overlayTtl')}
          control={
            <SettingsNumberField
              id="completion-style-overlay-ttl"
              value={overlayTtlMs}
              onChange={onSetOverlayTtlMs}
              onCommit={onSaveConfig}
              unit="ms"
              min={300}
              max={10000}
              step={100}
              aria-label={t('settings.autocomplete.completionStyle.overlayTtl')}
            />
          }
        />
        <SettingsRow
          htmlFor="completion-style-preset"
          label={t('autocomplete.stylePreset')}
          control={
            <SettingsSelect
              id="completion-style-preset"
              value={stylePreset}
              onChange={event => onSetStylePreset(event.target.value)}>
              <option value="balanced">{t('autocomplete.style.balanced')}</option>
              <option value="concise">{t('autocomplete.style.concise')}</option>
              <option value="formal">{t('autocomplete.style.formal')}</option>
              <option value="casual">{t('autocomplete.style.casual')}</option>
              <option value="custom">{t('autocomplete.style.custom')}</option>
            </SettingsSelect>
          }
        />
        <SettingsRow
          stacked
          htmlFor="completion-style-instructions"
          label={t('settings.autocomplete.completionStyle.styleInstructions')}
          control={
            <SettingsTextArea
              id="completion-style-instructions"
              value={styleInstructions}
              onChange={event => onSetStyleInstructions(event.target.value)}
              rows={3}
            />
          }
        />
        <SettingsRow
          stacked
          htmlFor="completion-style-examples"
          label={t('settings.autocomplete.completionStyle.styleExamples')}
          control={
            <SettingsTextArea
              id="completion-style-examples"
              value={styleExamplesText}
              onChange={event => onSetStyleExamplesText(event.target.value)}
              rows={3}
            />
          }
        />
        <SettingsRow
          stacked
          htmlFor="completion-style-disabled-apps"
          label={t('autocomplete.disabledApps')}
          control={
            <SettingsTextArea
              id="completion-style-disabled-apps"
              value={disabledAppsText}
              onChange={event => onSetDisabledAppsText(event.target.value)}
              rows={3}
            />
          }
        />
        <div className="flex items-center gap-2 px-4 py-3">
          <Button variant="primary" size="sm" onClick={onSaveConfig} disabled={isSaving}>
            {isSaving ? t('autocomplete.saving') : t('autocomplete.saveSettings')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.autocomplete.completionStyle.personalizationHistory')}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isHistoryLoading
              ? t('common.loading')
              : historyEntries.length === 0
                ? t('settings.autocomplete.completionStyle.noHistory')
                : (historyEntries.length === 1
                    ? t('settings.autocomplete.completionStyle.acceptedCompletion')
                    : t('settings.autocomplete.completionStyle.acceptedCompletions')
                  ).replace('{count}', String(historyEntries.length))}
          </p>
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            onClick={onClearHistory}
            disabled={isClearingHistory || historyEntries.length === 0}>
            {isClearingHistory
              ? t('settings.autocomplete.completionStyle.clearing')
              : t('settings.autocomplete.completionStyle.clearHistory')}
          </Button>
        </div>
        {historyEntries.length > 0 && (
          <div className="px-4 py-3">
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60 p-2">
              {historyEntries.map((entry, idx) => (
                <div
                  key={`${String(entry.timestamp_ms)}-${String(idx)}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                    <span className="shrink-0">
                      {new Date(entry.timestamp_ms).toLocaleString()}
                    </span>
                    {entry.app_name && (
                      <span className="rounded bg-neutral-100 px-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {entry.app_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 truncate text-neutral-800 dark:text-neutral-200">
                    <span className="shrink-0 text-neutral-400 dark:text-neutral-500">…</span>
                    <span className="truncate text-neutral-500 dark:text-neutral-400">
                      {entry.context.slice(-40)}
                    </span>
                    <span className="shrink-0 text-neutral-400 dark:text-neutral-500">→</span>
                    <span className="truncate font-medium text-primary-500">
                      {entry.suggestion}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsSection>
    </>
  );
};

export default CompletionStyleSection;
