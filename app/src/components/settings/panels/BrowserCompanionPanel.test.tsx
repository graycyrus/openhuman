/**
 * Tests for BrowserCompanionPanel — the Settings "Browser Companion" Chrome
 * extension pairing panel (Part 2 / Stage E2).
 *
 * Covers: disabled/running/connected render states, the enable toggle
 * calling `browser_companion_enable`, the pairing flow (extension id input →
 * `browser_companion_pair` → token shown + copy), the shared-tabs list, and
 * the "Install extension" button invoking the Tauri commands.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import type { BrowserCompanionStatus } from '../../../services/api/browserCompanionApi';

const hoisted = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  getBrowserCompanionStatus: vi.fn(),
  enableBrowserCompanion: vi.fn(),
  disableBrowserCompanion: vi.fn(),
  pairBrowserCompanionExtension: vi.fn(),
  unpairBrowserCompanion: vi.fn(),
  rotateBrowserCompanionSecret: vi.fn(),
  trackAnalyticsEvent: vi.fn(),
}));

vi.mock('../../../utils/tauriCommands/common', () => ({
  isTauri: hoisted.isTauri,
  safeInvoke: (...args: unknown[]) => hoisted.invoke(...args),
}));

vi.mock('../../../services/api/browserCompanionApi', () => ({
  getBrowserCompanionStatus: hoisted.getBrowserCompanionStatus,
  enableBrowserCompanion: hoisted.enableBrowserCompanion,
  disableBrowserCompanion: hoisted.disableBrowserCompanion,
  pairBrowserCompanionExtension: hoisted.pairBrowserCompanionExtension,
  unpairBrowserCompanion: hoisted.unpairBrowserCompanion,
  rotateBrowserCompanionSecret: hoisted.rotateBrowserCompanionSecret,
}));

vi.mock('../../analytics', () => ({ trackAnalyticsEvent: hoisted.trackAnalyticsEvent }));

vi.mock('../hooks/useSettingsNavigation', () => ({
  useSettingsNavigation: () => ({
    navigateToSettings: vi.fn(),
    navigateBack: vi.fn(),
    breadcrumbs: [],
  }),
}));

import BrowserCompanionPanel from './BrowserCompanionPanel';

const IDLE_STATUS: BrowserCompanionStatus = {
  running: false,
  extension_connected: false,
  paired_extension_id: null,
  relay_url: null,
  shared_tabs: [],
};

const RUNNING_DISCONNECTED_STATUS: BrowserCompanionStatus = {
  running: true,
  extension_connected: false,
  paired_extension_id: null,
  relay_url: 'ws://127.0.0.1:45001/v1/extension',
  shared_tabs: [],
};

const RUNNING_CONNECTED_STATUS: BrowserCompanionStatus = {
  running: true,
  extension_connected: true,
  paired_extension_id: 'abcdefghijklmnopabcdefghijklmnop',
  relay_url: 'ws://127.0.0.1:45001/v1/extension',
  shared_tabs: [
    { id: 1, window_id: 1, url: 'https://example.com/checkout', title: 'Checkout' },
    { id: 2, window_id: 1, url: 'https://example.com/cart', title: 'Cart' },
  ],
};

function setupClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

describe('BrowserCompanionPanel', () => {
  beforeEach(() => {
    vi.useRealTimers();
    hoisted.invoke.mockReset();
    hoisted.isTauri.mockReset();
    hoisted.isTauri.mockReturnValue(true);
    hoisted.getBrowserCompanionStatus.mockReset();
    hoisted.enableBrowserCompanion.mockReset();
    hoisted.disableBrowserCompanion.mockReset();
    hoisted.pairBrowserCompanionExtension.mockReset();
    hoisted.unpairBrowserCompanion.mockReset();
    hoisted.rotateBrowserCompanionSecret.mockReset();
    hoisted.trackAnalyticsEvent.mockReset();
  });

  it('renders the disabled state: relay stopped, no pairing section', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(IDLE_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);

    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    // Pairing/shared-tabs sections only render once the relay is running.
    expect(screen.queryByText('Pairing')).not.toBeInTheDocument();
    expect(screen.queryByText('Shared tabs')).not.toBeInTheDocument();
  });

  it('renders running + disconnected: pairing section shown, no token yet', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);

    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText('Pairing')).toBeInTheDocument();
    expect(screen.getByDisplayValue(RUNNING_DISCONNECTED_STATUS.relay_url!)).toBeInTheDocument();
    expect(screen.getByText('Pair or rotate the secret to reveal a token')).toBeInTheDocument();
    // No paired extension id yet, so the danger zone (rotate/unpair) is hidden.
    expect(screen.queryByText('Danger zone')).not.toBeInTheDocument();
  });

  it('renders running + connected with shared tabs listed', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_CONNECTED_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Checkout')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/checkout')).toBeInTheDocument();
    expect(screen.getByText('Cart')).toBeInTheDocument();
    expect(screen.getByText('Danger zone')).toBeInTheDocument();
  });

  it('the enable toggle calls browser_companion_enable and updates status', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(IDLE_STATUS);
    hoisted.enableBrowserCompanion.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Stopped');

    const toggle = screen.getByRole('switch', { name: 'Enable Browser Companion' });
    fireEvent.click(toggle);

    await waitFor(() => expect(hoisted.enableBrowserCompanion).toHaveBeenCalledTimes(1));
    await screen.findByText('Running');
    expect(hoisted.trackAnalyticsEvent).toHaveBeenCalledWith('browser_companion_enabled');
  });

  it('the enable toggle calls browser_companion_disable when turning off', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);
    hoisted.disableBrowserCompanion.mockResolvedValue(IDLE_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Running');

    const toggle = screen.getByRole('switch', { name: 'Enable Browser Companion' });
    fireEvent.click(toggle);

    await waitFor(() => expect(hoisted.disableBrowserCompanion).toHaveBeenCalledTimes(1));
    await screen.findByText('Stopped');
    expect(hoisted.trackAnalyticsEvent).not.toHaveBeenCalledWith('browser_companion_enabled');
  });

  it('pairs an extension id, shows the token, and copies it', async () => {
    const writeText = setupClipboard();
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);
    hoisted.pairBrowserCompanionExtension.mockResolvedValue({
      relay_url: 'ws://127.0.0.1:45001/v1/extension',
      pairing_secret: 'super-secret-token',
    });

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Pairing');

    const input = screen.getByLabelText('Extension ID');
    fireEvent.change(input, { target: { value: 'abcdefghijklmnopabcdefghijklmnop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));

    await waitFor(() =>
      expect(hoisted.pairBrowserCompanionExtension).toHaveBeenCalledWith(
        'abcdefghijklmnopabcdefghijklmnop'
      )
    );
    expect(hoisted.trackAnalyticsEvent).toHaveBeenCalledWith('browser_companion_paired');

    expect(await screen.findByDisplayValue('super-secret-token')).toBeInTheDocument();

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(copyButtons[copyButtons.length - 1]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('super-secret-token'));
  });

  it('the Install extension button resolves the path then reveals it via Tauri commands', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);
    hoisted.invoke.mockImplementation((cmd: string) => {
      if (cmd === 'browser_companion_extension_path') {
        return Promise.resolve('/Applications/OpenHuman.app/Contents/Resources/browser-extension');
      }
      return Promise.resolve(undefined);
    });

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Pairing');

    fireEvent.click(screen.getByRole('button', { name: 'Install extension' }));

    await waitFor(() =>
      expect(hoisted.invoke).toHaveBeenCalledWith('browser_companion_extension_path')
    );
    await waitFor(() =>
      expect(hoisted.invoke).toHaveBeenCalledWith('browser_companion_reveal_extension')
    );
  });

  it('the "Open chrome://extensions" button invokes its Tauri command', async () => {
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);
    hoisted.invoke.mockResolvedValue(undefined);

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Pairing');

    fireEvent.click(screen.getByRole('button', { name: 'Open chrome://extensions' }));

    await waitFor(() =>
      expect(hoisted.invoke).toHaveBeenCalledWith('browser_companion_open_chrome_extensions')
    );
  });

  it('hides the install/open-extensions buttons outside Tauri', async () => {
    hoisted.isTauri.mockReturnValue(false);
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Pairing');

    expect(screen.queryByRole('button', { name: 'Install extension' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open chrome://extensions' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Installing the extension is available on desktop only')
    ).toBeInTheDocument();
  });

  it('rotates the pairing secret after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_CONNECTED_STATUS);
    hoisted.rotateBrowserCompanionSecret.mockResolvedValue({
      relay_url: 'ws://127.0.0.1:45001/v1/extension',
      pairing_secret: 'rotated-token',
    });

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Danger zone');

    fireEvent.click(screen.getByRole('button', { name: 'Rotate secret' }));

    await waitFor(() => expect(hoisted.rotateBrowserCompanionSecret).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue('rotated-token')).toBeInTheDocument();
  });

  it('does not rotate the secret when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_CONNECTED_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Danger zone');

    fireEvent.click(screen.getByRole('button', { name: 'Rotate secret' }));

    expect(hoisted.rotateBrowserCompanionSecret).not.toHaveBeenCalled();
  });

  it('unpairs the extension after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    hoisted.getBrowserCompanionStatus.mockResolvedValue(RUNNING_CONNECTED_STATUS);
    hoisted.unpairBrowserCompanion.mockResolvedValue(RUNNING_DISCONNECTED_STATUS);

    renderWithProviders(<BrowserCompanionPanel />);
    await screen.findByText('Danger zone');

    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));

    await waitFor(() => expect(hoisted.unpairBrowserCompanion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Danger zone')).not.toBeInTheDocument());
  });

  it('surfaces a load error banner when status fails to load', async () => {
    hoisted.getBrowserCompanionStatus.mockRejectedValue(new Error('core unreachable'));

    renderWithProviders(<BrowserCompanionPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('core unreachable');
  });
});
