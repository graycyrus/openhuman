// [settings] Browser Companion pairing panel (Part 2 / Stage E2). Drives the
// `openhuman.browser_companion_*` RPC surface (see `browserCompanionApi.ts`)
// and the three `browser_companion_*` Tauri IPC commands the desktop shell
// exposes for the "Install extension" affordance.
import debug from 'debug';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '../../../lib/i18n/I18nContext';
import {
  type BrowserCompanionPairing,
  type BrowserCompanionStatus,
  disableBrowserCompanion,
  enableBrowserCompanion,
  getBrowserCompanionStatus,
  pairBrowserCompanionExtension,
  rotateBrowserCompanionSecret,
  unpairBrowserCompanion,
} from '../../../services/api/browserCompanionApi';
// `safeInvoke` (aliased to `invoke`) converts the CEF `window.ipc.postMessage`
// synchronous throw — Sentry TAURI-REACT-7 / TAURI-REACT-6 — into a rejected
// Promise the existing try/catch sees as a normal IPC failure.
import { safeInvoke as invoke, isTauri } from '../../../utils/tauriCommands/common';
import { trackAnalyticsEvent } from '../../analytics';
import Button from '../../ui/Button';
import {
  SettingsBadge,
  SettingsEmptyState,
  SettingsRow,
  SettingsSection,
  SettingsStatusLine,
  SettingsSwitch,
  SettingsTextField,
} from '../controls';
import SettingsPanel from '../layout/SettingsPanel';

const log = debug('browser-companion-panel');

/** Poll cadence for the status card while the panel is mounted and enabled. */
const STATUS_POLL_MS = 5_000;
/** How long the "Copied!" affordance stays up after a successful copy. */
const COPY_RESET_MS = 2_000;

const BrowserCompanionPanel = () => {
  const { t } = useT();

  const [status, setStatus] = useState<BrowserCompanionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // The pairing secret is returned ONLY by `pair` / `rotate_secret` and must
  // never be persisted — held here in local component state only, cleared on
  // unmount.
  const [pairing, setPairing] = useState<BrowserCompanionPairing | null>(null);
  const [extensionIdInput, setExtensionIdInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [isUnpairing, setIsUnpairing] = useState(false);
  const [unpairError, setUnpairError] = useState<string | null>(null);

  const [copiedRelayUrl, setCopiedRelayUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [installError, setInstallError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [openExtensionsError, setOpenExtensionsError] = useState<string | null>(null);

  // Monotonic guard so an out-of-order poll/action response can't clobber the
  // UI with a stale status.
  const statusSeqRef = useRef(0);

  const loadStatus = useCallback(async () => {
    const seq = ++statusSeqRef.current;
    log('loadStatus: entry');
    try {
      const next = await getBrowserCompanionStatus();
      if (statusSeqRef.current !== seq) return;
      log('loadStatus: response running=%s connected=%s', next.running, next.extension_connected);
      setStatus(next);
      setLoadError(null);
    } catch (e) {
      if (statusSeqRef.current !== seq) return;
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.loadError');
      log('loadStatus: error %s', msg);
      setLoadError(msg);
    } finally {
      if (statusSeqRef.current === seq) setIsLoading(false);
    }
  }, [t]);

  // Initial load + poll while running so the status/shared-tabs card stays
  // fresh without a manual refresh (e.g. a paired extension connecting/
  // disconnecting, or sharing a new tab, from outside this panel's actions).
  useEffect(() => {
    void loadStatus();
    const interval = setInterval(() => void loadStatus(), STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // Clear the sensitive pairing secret from state on unmount.
  useEffect(() => {
    return () => setPairing(null);
  }, []);

  useEffect(() => {
    if (!copiedRelayUrl) return;
    const timer = setTimeout(() => setCopiedRelayUrl(false), COPY_RESET_MS);
    return () => clearTimeout(timer);
  }, [copiedRelayUrl]);

  useEffect(() => {
    if (!copiedSecret) return;
    const timer = setTimeout(() => setCopiedSecret(false), COPY_RESET_MS);
    return () => clearTimeout(timer);
  }, [copiedSecret]);

  const handleToggleEnabled = async (next: boolean) => {
    setToggleError(null);
    setIsTogglingEnabled(true);
    try {
      const updated = next ? await enableBrowserCompanion() : await disableBrowserCompanion();
      log('handleToggleEnabled: next=%s running=%s', next, updated.running);
      setStatus(updated);
      if (next) trackAnalyticsEvent('browser_companion_enabled');
      if (!next) {
        // Disabling drops the relay — any pairing material displayed for the
        // now-stopped relay is stale, so clear it rather than show a dead URL.
        setPairing(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.saveError');
      log('handleToggleEnabled: error %s', msg);
      setToggleError(msg);
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handlePair = async () => {
    const extensionId = extensionIdInput.trim();
    if (!extensionId) return;
    setPairError(null);
    setIsPairing(true);
    try {
      const result = await pairBrowserCompanionExtension(extensionId);
      log('handlePair: paired, relay_url=%s', result.relay_url);
      setPairing(result);
      setExtensionIdInput('');
      trackAnalyticsEvent('browser_companion_paired');
      await loadStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.pairError');
      log('handlePair: error %s', msg);
      setPairError(msg);
    } finally {
      setIsPairing(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!window.confirm(t('settings.browserCompanion.rotateConfirm'))) return;
    setRotateError(null);
    setIsRotating(true);
    try {
      const result = await rotateBrowserCompanionSecret();
      log('handleRotateSecret: rotated, relay_url=%s', result.relay_url);
      setPairing(result);
      await loadStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.rotateError');
      log('handleRotateSecret: error %s', msg);
      setRotateError(msg);
    } finally {
      setIsRotating(false);
    }
  };

  const handleUnpair = async () => {
    if (!window.confirm(t('settings.browserCompanion.unpairConfirm'))) return;
    setUnpairError(null);
    setIsUnpairing(true);
    try {
      const updated = await unpairBrowserCompanion();
      log('handleUnpair: done, running=%s', updated.running);
      setStatus(updated);
      setPairing(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.unpairError');
      log('handleUnpair: error %s', msg);
      setUnpairError(msg);
    } finally {
      setIsUnpairing(false);
    }
  };

  const copyText = async (value: string, onDone: () => void) => {
    try {
      await navigator.clipboard.writeText(value);
      onDone();
    } catch {
      // Clipboard write failed — silently ignore (no destructive fallback
      // needed here, unlike the recovery-phrase panel, since the value is
      // still visible on screen for manual copy).
    }
  };

  const handleInstallExtension = async () => {
    setInstallError(null);
    setIsInstalling(true);
    try {
      const path = await invoke<string>('browser_companion_extension_path');
      log('handleInstallExtension: resolved path len=%d', path.length);
      await invoke('browser_companion_reveal_extension');
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.installError');
      log('handleInstallExtension: error %s', msg);
      setInstallError(msg);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleOpenChromeExtensions = async () => {
    setOpenExtensionsError(null);
    try {
      await invoke('browser_companion_open_chrome_extensions');
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('settings.browserCompanion.installError');
      log('handleOpenChromeExtensions: error %s', msg);
      setOpenExtensionsError(msg);
    }
  };

  const enabled = status?.enabled ?? false;
  const running = status?.running ?? false;
  const extensionConnected = status?.extension_connected ?? false;
  const relayUrl = status?.relay_url ?? pairing?.relay_url ?? null;
  const sharedTabs = status?.shared_tabs ?? [];

  return (
    <SettingsPanel
      description={t('settings.browserCompanion.menuDesc')}
      testId="browser-companion-panel">
      {isLoading ? (
        <p className="text-sm text-content-muted">{t('settings.browserCompanion.loading')}</p>
      ) : (
        <div className="space-y-5">
          {loadError && (
            <p role="alert" className="text-sm text-coral-600 dark:text-coral-300">
              {loadError}
            </p>
          )}

          {/* Status card */}
          <SettingsSection title={t('settings.browserCompanion.statusTitle')}>
            <SettingsRow
              label={t('settings.browserCompanion.relayStatusLabel')}
              control={
                <SettingsBadge variant={running ? 'success' : 'neutral'}>
                  {running
                    ? t('settings.browserCompanion.running')
                    : t('settings.browserCompanion.stopped')}
                </SettingsBadge>
              }
            />
            <SettingsRow
              label={t('settings.browserCompanion.extensionStatusLabel')}
              control={
                <SettingsBadge variant={extensionConnected ? 'success' : 'neutral'}>
                  {extensionConnected
                    ? t('settings.browserCompanion.extensionConnected')
                    : t('settings.browserCompanion.extensionDisconnected')}
                </SettingsBadge>
              }
            />
            <SettingsRow
              htmlFor="switch-browser-companion-enabled"
              label={t('settings.browserCompanion.enableLabel')}
              description={t('settings.browserCompanion.enableDesc')}
              control={
                <SettingsSwitch
                  id="switch-browser-companion-enabled"
                  checked={enabled}
                  onCheckedChange={next => void handleToggleEnabled(next)}
                  disabled={isTogglingEnabled}
                  aria-label={t('settings.browserCompanion.enableLabel')}
                />
              }
            />
            <div className="px-4 pb-3 -mt-1">
              <SettingsStatusLine
                saving={isTogglingEnabled}
                error={toggleError}
                savingLabel={t('settings.browserCompanion.saving')}
              />
            </div>
          </SettingsSection>

          {/* Pairing — available once ENABLED (not once running): the relay
              cannot start until an extension is paired here, so gating this on
              `running` would deadlock (can't pair without running, can't run
              without pairing). The relay URL + secret rows below only populate
              after a successful pair starts the relay. */}
          {enabled && (
            <SettingsSection
              title={t('settings.browserCompanion.pairingTitle')}
              description={t('settings.browserCompanion.pairingDesc')}>
              <SettingsRow
                stacked
                label={t('settings.browserCompanion.relayUrl')}
                control={
                  <div className="flex items-center gap-2">
                    <SettingsTextField
                      mono
                      readOnly
                      value={relayUrl ?? ''}
                      aria-label={t('settings.browserCompanion.relayUrl')}
                      inputSize="sm"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      analyticsId="browser-companion-copy-relay-url"
                      disabled={!relayUrl}
                      onClick={() =>
                        relayUrl ? void copyText(relayUrl, () => setCopiedRelayUrl(true)) : undefined
                      }>
                      {copiedRelayUrl
                        ? t('settings.browserCompanion.copied')
                        : t('settings.browserCompanion.copy')}
                    </Button>
                  </div>
                }
              />

              <SettingsRow
                stacked
                label={t('settings.browserCompanion.pairingSecret')}
                control={
                  pairing?.pairing_secret ? (
                    <div className="flex items-center gap-2">
                      <SettingsTextField
                        mono
                        readOnly
                        value={pairing.pairing_secret}
                        aria-label={t('settings.browserCompanion.pairingSecret')}
                        inputSize="sm"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        analyticsId="browser-companion-copy-secret"
                        onClick={() =>
                          void copyText(pairing.pairing_secret, () => setCopiedSecret(true))
                        }>
                        {copiedSecret
                          ? t('settings.browserCompanion.copied')
                          : t('settings.browserCompanion.copy')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-content-muted">
                      {t('settings.browserCompanion.pairingSecretNone')}
                    </p>
                  )
                }
              />

              {/* Pair a new extension id */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-line-subtle">
                <SettingsTextField
                  mono
                  className="flex-1"
                  value={extensionIdInput}
                  onChange={e => setExtensionIdInput(e.target.value)}
                  placeholder={t('settings.browserCompanion.extensionIdPlaceholder')}
                  aria-label={t('settings.browserCompanion.extensionIdLabel')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handlePair();
                    }
                  }}
                  inputSize="sm"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="xs"
                  analyticsId="browser-companion-pair"
                  disabled={!extensionIdInput.trim() || isPairing}
                  onClick={() => void handlePair()}>
                  {t('settings.browserCompanion.pairButton')}
                </Button>
              </div>
              <div className="px-4 pb-3 -mt-1">
                <SettingsStatusLine
                  saving={isPairing}
                  error={pairError}
                  savingLabel={t('settings.browserCompanion.saving')}
                />
              </div>

              {/* Install extension */}
              <div className="flex flex-col gap-2 px-4 py-3 border-t border-line-subtle">
                {!isTauri() && (
                  <p className="text-xs text-content-muted">
                    {t('settings.browserCompanion.desktopOnly')}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {isTauri() && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      analyticsId="browser-companion-install-extension"
                      disabled={isInstalling}
                      onClick={() => void handleInstallExtension()}>
                      {t('settings.browserCompanion.installExtension')}
                    </Button>
                  )}
                  {isTauri() && (
                    <Button
                      type="button"
                      variant="tertiary"
                      size="xs"
                      analyticsId="browser-companion-open-chrome-extensions"
                      onClick={() => void handleOpenChromeExtensions()}>
                      {t('settings.browserCompanion.openChromeExtensions')}
                    </Button>
                  )}
                </div>
                {installError && (
                  <p role="alert" className="text-xs text-coral-600 dark:text-coral-300">
                    {installError}
                  </p>
                )}
                {openExtensionsError && (
                  <p role="alert" className="text-xs text-coral-600 dark:text-coral-300">
                    {openExtensionsError}
                  </p>
                )}
              </div>
            </SettingsSection>
          )}

          {/* Shared tabs */}
          {running && (
            <SettingsSection
              title={t('settings.browserCompanion.sharedTabsTitle')}
              description={t('settings.browserCompanion.sharedTabsDesc')}>
              {sharedTabs.length === 0 ? (
                <SettingsEmptyState label={t('settings.browserCompanion.noSharedTabs')} />
              ) : (
                <ul>
                  {sharedTabs.map(tab => (
                    <li key={tab.id} className="px-4 py-2.5" data-testid="shared-tab-row">
                      <p className="text-xs font-medium text-content truncate">{tab.title}</p>
                      <p className="text-xs text-content-muted truncate">{tab.url}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SettingsSection>
          )}

          {/* Danger zone: rotate secret / unpair */}
          {running && status?.paired_extension_id && (
            <SettingsSection title={t('settings.browserCompanion.dangerZoneTitle')}>
              <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  analyticsId="browser-companion-rotate-secret"
                  disabled={isRotating}
                  onClick={() => void handleRotateSecret()}>
                  {t('settings.browserCompanion.rotateSecret')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  tone="danger"
                  size="xs"
                  analyticsId="browser-companion-unpair"
                  disabled={isUnpairing}
                  onClick={() => void handleUnpair()}>
                  {t('settings.browserCompanion.unpair')}
                </Button>
              </div>
              <div className="px-4 pb-3 -mt-1">
                <SettingsStatusLine
                  saving={isRotating || isUnpairing}
                  error={rotateError ?? unpairError}
                  savingLabel={t('settings.browserCompanion.saving')}
                />
              </div>
            </SettingsSection>
          )}
        </div>
      )}
    </SettingsPanel>
  );
};

export default BrowserCompanionPanel;
