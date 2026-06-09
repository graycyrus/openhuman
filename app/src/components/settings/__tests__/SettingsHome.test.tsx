import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../../lib/i18n/I18nContext';
import type { Locale } from '../../../lib/i18n/types';
import localeReducer from '../../../store/localeSlice';
import themeReducer, {
  type AgentMessageViewMode,
  type FontSize,
  type TabBarLabels,
  type ThemeMode,
} from '../../../store/themeSlice';
import SettingsHome from '../SettingsHome';

// `useDeveloperMode` combines IS_DEV || developerMode.  In tests IS_DEV is
// true (Vite test mode), so mock the hook to control the gate explicitly.
const devModeHoisted = vi.hoisted(() => ({ value: false }));
vi.mock('../../../hooks/useDeveloperMode', () => ({
  useDeveloperMode: () => devModeHoisted.value,
}));

function makeTestStore(locale: Locale = 'en', developerMode = false) {
  return configureStore({
    reducer: { locale: localeReducer, theme: themeReducer },
    preloadedState: {
      locale: { current: locale },
      theme: {
        mode: 'system' as ThemeMode,
        tabBarLabels: 'hover' as TabBarLabels,
        fontSize: 'medium' as FontSize,
        agentMessageViewMode: 'bubbles' as AgentMessageViewMode,
        developerMode,
      },
    },
  });
}

// --- hoisted mocks ---

const { mockNavigate, mockNavigateToSettings } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockNavigateToSettings: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../hooks/useSettingsNavigation', () => ({
  useSettingsNavigation: () => ({ navigateToSettings: mockNavigateToSettings }),
}));

const mockClearSession = vi.fn().mockResolvedValue(undefined);
let mockSessionToken: string | null = null;

vi.mock('../../../providers/CoreStateProvider', () => ({
  useCoreState: () => ({
    clearSession: mockClearSession,
    snapshot: { auth: { userId: null }, currentUser: null, sessionToken: mockSessionToken },
  }),
}));

vi.mock('../../../store', () => ({ persistor: { purge: vi.fn().mockResolvedValue(undefined) } }));

vi.mock('../../../utils/links', () => ({ BILLING_DASHBOARD_URL: 'https://billing.example.com' }));

vi.mock('../../../utils/openUrl', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../../utils/tauriCommands', () => ({
  resetOpenHumanDataAndRestartCore: vi.fn().mockResolvedValue(undefined),
  restartApp: vi.fn().mockResolvedValue(undefined),
  scheduleCefProfilePurge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../walkthrough/AppWalkthrough', () => ({ resetWalkthrough: vi.fn() }));

// --- helpers ---

function renderSettingsHome({ locale = 'en', withI18n = false, developerMode = false } = {}) {
  // Set the mocked hook value before rendering.
  devModeHoisted.value = developerMode;

  const content = withI18n ? (
    <I18nProvider>
      <SettingsHome />
    </I18nProvider>
  ) : (
    <SettingsHome />
  );

  return render(
    <Provider store={makeTestStore(locale as Locale, developerMode)}>
      <MemoryRouter>{content}</MemoryRouter>
    </Provider>
  );
}

// --- tests ---

describe('SettingsHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    devModeHoisted.value = false;
  });

  describe('flat menu', () => {
    // Section headers ("General", "Features & AI", "Billing & Rewards",
    // "Support", "Danger Zone") were intentionally removed — the menu is
    // now a single flat list to reduce visual noise.
    it.each(['General', 'Features & AI', 'Billing & Rewards', 'Support', 'Danger Zone'])(
      'does not render section header: %s',
      label => {
        renderSettingsHome();
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    );

    it('renders the core menu items in a single list', () => {
      renderSettingsHome();
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Billing & Usage')).toBeInTheDocument();
      // Developer & Diagnostics entry is hidden by default (developerMode=false)
      expect(screen.queryByTestId('settings-nav-developer-options')).not.toBeInTheDocument();
      expect(screen.getByTestId('settings-nav-account')).toBeInTheDocument();
    });

    it('no longer renders Alerts / Notifications on the home screen', () => {
      // Both moved into the Advanced → Notifications hub.
      renderSettingsHome();
      expect(screen.queryByTestId('settings-nav-alerts')).not.toBeInTheDocument();
      expect(screen.queryByTestId('settings-nav-notifications')).not.toBeInTheDocument();
    });

    it('no longer renders destructive actions on the home screen', () => {
      // Clear App Data + Log out moved to Settings → Account.
      renderSettingsHome();
      expect(screen.queryByText('Clear App Data')).not.toBeInTheDocument();
      expect(screen.queryByText('Log out')).not.toBeInTheDocument();
    });

    it('localizes Appearance and Mascot menu items', () => {
      renderSettingsHome({ locale: 'zh-CN', withI18n: true });

      expect(screen.getByText('外观')).toBeInTheDocument();
      expect(screen.getByText('选择浅色、深色或跟随系统主题')).toBeInTheDocument();
      expect(screen.getByText('吉祥物')).toBeInTheDocument();
      expect(screen.getByText('选择应用内使用的吉祥物颜色')).toBeInTheDocument();
    });

    it('no longer renders Features / AI / Rewards / Restart Tour / About on the home screen', () => {
      renderSettingsHome();
      expect(screen.queryByText('Features')).not.toBeInTheDocument();
      expect(screen.queryByText('AI Configuration')).not.toBeInTheDocument();
      expect(screen.queryByText('Rewards')).not.toBeInTheDocument();
      expect(screen.queryByText('Restart Tour')).not.toBeInTheDocument();
      expect(screen.queryByText('About')).not.toBeInTheDocument();
    });
  });

  describe('language selector', () => {
    it('offers Bahasa Indonesia as a display language', () => {
      renderSettingsHome();

      expect(screen.getByRole('option', { name: /Bahasa Indonesia/ })).toHaveValue('id');
    });
  });

  describe('existing navigation items', () => {
    it('navigates to account settings when Account is clicked', async () => {
      const user = userEvent.setup();
      renderSettingsHome();

      await user.click(screen.getByText('Account').closest('button')!);
      expect(mockNavigateToSettings).toHaveBeenCalledWith('account');
    });

    it('navigates to the Agents section when Agents is clicked', async () => {
      const user = userEvent.setup();
      renderSettingsHome();

      // Persona, Agent OS access, etc. now live under the Agents section page.
      await user.click(screen.getByText('Agents').closest('button')!);
      expect(mockNavigateToSettings).toHaveBeenCalledWith('agents-settings');
    });

    it('navigates to the Crypto section when Crypto is clicked', async () => {
      const user = userEvent.setup();
      renderSettingsHome();

      // Recovery phrase + wallet balances now live under the Crypto section page.
      await user.click(screen.getByText('Crypto').closest('button')!);
      expect(mockNavigateToSettings).toHaveBeenCalledWith('crypto');
    });

    it('opens billing URL when Billing & Usage is clicked', async () => {
      const { openUrl } = await import('../../../utils/openUrl');
      const user = userEvent.setup();
      renderSettingsHome();

      await user.click(screen.getByText('Billing & Usage').closest('button')!);
      expect(openUrl).toHaveBeenCalledWith('https://billing.example.com');
    });

    it('navigates to developer-options when "Developer & Diagnostics" is clicked (developerMode=true)', async () => {
      const user = userEvent.setup();
      renderSettingsHome({ developerMode: true });

      await user.click(screen.getByText('Developer & Diagnostics').closest('button')!);
      expect(mockNavigateToSettings).toHaveBeenCalledWith('developer-options');
    });
  });

  describe('developer mode gate', () => {
    it('hides the developer-options entry when developerMode is off', () => {
      renderSettingsHome({ developerMode: false });
      expect(screen.queryByTestId('settings-nav-developer-options')).not.toBeInTheDocument();
      // The English resolved text should also be absent
      expect(screen.queryByText('Developer & Diagnostics')).not.toBeInTheDocument();
    });

    it('shows the developer-options entry when developerMode is on', () => {
      renderSettingsHome({ developerMode: true });
      expect(screen.getByTestId('settings-nav-developer-options')).toBeInTheDocument();
      // useT() resolves to English even without I18nProvider
      expect(screen.getByText('Developer & Diagnostics')).toBeInTheDocument();
    });
  });

  describe('local session gating', () => {
    beforeEach(() => {
      // Use a valid local-session token (three parts, last part = 'local')
      mockSessionToken = 'header.payload.local';
    });

    afterEach(() => {
      mockSessionToken = null;
    });

    it('hides the Billing & Usage item in local mode', () => {
      renderSettingsHome();
      expect(screen.queryByText('Billing & Usage')).not.toBeInTheDocument();
    });

    it('shows "Billing & Usage" when not in local mode', () => {
      mockSessionToken = null;
      renderSettingsHome();
      expect(screen.getByText('Billing & Usage')).toBeInTheDocument();
    });
  });
  // Clear App Data flow moved to LogoutAndClearActions (rendered on Account
  // page) — see LogoutAndClearActions.test.tsx.
});
