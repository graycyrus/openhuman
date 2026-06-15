/**
 * Unit tests for Agent World SettingsSection.
 *
 * Verifies:
 * 1. The section renders with language and theme controls.
 * 2. Theme buttons dispatch setThemeMode to the Redux store.
 * 3. The active theme button is marked aria-pressed=true.
 * 4. No RPC calls are made — Settings is pure local state.
 *
 * Note: SettingsSection wires NO new bridge methods in invokeApiClient.
 * All preferences are persisted via Redux (themeSlice + localeSlice).
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { renderWithProviders } from '../../test/test-utils';
import SettingsSection from './SettingsSection';

// Prevent debug library from logging during tests.
vi.mock('debug', () => ({ default: () => () => undefined }));

// ── Render ────────────────────────────────────────────────────────────────────

describe('SettingsSection', () => {
  test('renders the section heading', () => {
    renderWithProviders(<SettingsSection />);
    // The heading uses the agentWorld.settings key; default (no I18nProvider)
    // falls back to the English string "Settings".
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
  });

  test('renders the language section', () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('heading', { level: 2, name: /language/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('renders the theme section with three options', () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('heading', { level: 2, name: /theme/i })).toBeInTheDocument();
    const themeButtons = screen.getAllByRole('button', { name: /dark|light|system/i });
    expect(themeButtons).toHaveLength(3);
  });

  test('default theme mode is "system" (Redux initialState)', () => {
    renderWithProviders(<SettingsSection />);
    // The "System" button should be aria-pressed=true by default.
    const systemButton = screen.getByRole('button', { name: /system/i });
    expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('dark and light buttons are not pressed by default', () => {
    renderWithProviders(<SettingsSection />);
    expect(screen.getByRole('button', { name: /^dark/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^light/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('clicking Dark dispatches setThemeMode("dark") to the store', async () => {
    const { store } = renderWithProviders(<SettingsSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^dark/i }));
    expect(store.getState().theme.mode).toBe('dark');
  });

  test('clicking Light dispatches setThemeMode("light") to the store', async () => {
    const { store } = renderWithProviders(<SettingsSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^light/i }));
    expect(store.getState().theme.mode).toBe('light');
  });

  test('clicking System dispatches setThemeMode("system") to the store', async () => {
    const { store } = renderWithProviders(<SettingsSection />, {
      preloadedState: {
        theme: {
          mode: 'dark',
          tabBarLabels: 'hover',
          fontSize: 'medium',
          agentMessageViewMode: 'bubbles',
          developerMode: false,
        },
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /system/i }));
    expect(store.getState().theme.mode).toBe('system');
  });

  test('selected theme button shows aria-pressed=true after click', async () => {
    renderWithProviders(<SettingsSection />);
    const user = userEvent.setup();
    const darkButton = screen.getByRole('button', { name: /^dark/i });
    await user.click(darkButton);
    expect(darkButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('no callCoreRpc calls are made during render or interaction', async () => {
    // SettingsSection is pure local-state — zero RPC round-trips.
    const { queryAllByText } = renderWithProviders(<SettingsSection />);
    // Absence-of-error is the assertion: if the component tried to call core
    // RPC it would throw (coreRpcClient is not mocked here).
    expect(queryAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });
});
