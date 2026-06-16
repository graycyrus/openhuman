/**
 * SettingsSection — Agent World settings: language and theme preferences.
 *
 * Ported from tiny.place `website/src/components/explore/Settings.tsx`.
 * The original used zustand (`useAppStore`) and react-i18next (`useTranslation`).
 * This port replaces those with:
 *   - OpenHuman's Redux store (`localeSlice` + `themeSlice`) for persistence.
 *   - `useT()` from `I18nContext` for translations.
 *   - `LanguageSelect` for the locale picker (shared with main Settings).
 *
 * No SDK calls are made by this section — it is pure local-state UI.
 * Therefore no Rust handlers or bridge methods are added for this section.
 */
import debug from 'debug';
import { LuCheck } from 'react-icons/lu';

import LanguageSelect from '../../components/LanguageSelect';
import { useT } from '../../lib/i18n/I18nContext';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setThemeMode, type ThemeMode } from '../../store/themeSlice';

const log = debug('openhuman:agent-world:settings');

// ── Theme options ─────────────────────────────────────────────────────────────

interface ThemeOption {
  mode: ThemeMode;
  labelKey: string;
  /** Preview swatch colours — mirrors tiny.place's visual style. */
  background: string;
  surface: string;
  foreground: string;
  accent: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    mode: 'dark',
    labelKey: 'agentWorld.settings.theme.dark',
    background: '#050505',
    surface: '#171717',
    foreground: '#fafafa',
    accent: '#4A83DD',
  },
  {
    mode: 'light',
    labelKey: 'agentWorld.settings.theme.light',
    background: '#ffffff',
    surface: '#f5f5f5',
    foreground: '#111111',
    accent: '#111111',
  },
  {
    mode: 'system',
    labelKey: 'agentWorld.settings.theme.system',
    background: '#0f172a',
    surface: '#1e293b',
    foreground: '#e2e8f0',
    accent: '#4A83DD',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsSection() {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(state => state.theme.mode);

  log('render theme_mode=%s', themeMode);

  return (
    <div className="h-full max-w-2xl space-y-6 overflow-y-auto p-6">
      {/* Header */}
      <header>
        <h1 className="font-heading text-2xl font-bold text-stone-900 dark:text-neutral-100">
          {t('agentWorld.settings')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-neutral-400">
          {t('agentWorld.settings.description')}
        </p>
      </header>

      {/* Language */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">
          {t('agentWorld.settings.language')}
        </h2>
        <LanguageSelect
          ariaLabel={t('agentWorld.settings.language')}
          id="agent-world-language-select"
        />
      </section>

      {/* Theme */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100">
          {t('agentWorld.settings.theme')}
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map(option => {
            const selected = option.mode === themeMode;

            return (
              <button
                key={option.mode}
                aria-pressed={selected}
                type="button"
                onClick={() => {
                  log('theme_select mode=%s', option.mode);
                  dispatch(setThemeMode(option.mode));
                }}
                className={[
                  'group rounded-md border p-2 text-left transition-colors',
                  selected
                    ? 'border-ocean ring-1 ring-ocean'
                    : 'border-stone-200 bg-white hover:border-stone-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
                ].join(' ')}>
                {/* Colour swatch preview */}
                <div
                  className="overflow-hidden rounded border border-black/10"
                  style={{ backgroundColor: option.background }}>
                  <div className="flex h-14 items-center gap-2 p-2">
                    <div
                      className="h-8 w-8 rounded shrink-0"
                      style={{ backgroundColor: option.surface }}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div
                        className="h-2 w-3/4 rounded-full"
                        style={{ backgroundColor: option.foreground }}
                      />
                      <div
                        className="h-2 w-1/2 rounded-full opacity-60"
                        style={{ backgroundColor: option.foreground }}
                      />
                    </div>
                    <div
                      className="h-5 w-5 rounded-full shrink-0"
                      style={{ backgroundColor: option.accent }}
                    />
                  </div>
                </div>
                {/* Label + selected indicator */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-900 dark:text-neutral-100">
                    {t(option.labelKey)}
                  </span>
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-full',
                      selected
                        ? 'bg-ocean text-white'
                        : 'bg-stone-200 text-stone-500 dark:bg-neutral-700 dark:text-neutral-400',
                    ].join(' ')}>
                    {selected ? <LuCheck size={14} /> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
