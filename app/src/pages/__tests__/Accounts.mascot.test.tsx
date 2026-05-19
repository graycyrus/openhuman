import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/* ── import under test ─────────────────────────────────────────────── */
import Accounts from '../Accounts';

/* ── heavy child stubs ─────────────────────────────────────────────── */
vi.mock('../Conversations', () => ({
  AgentChatPanel: () => <div data-testid="agent-chat-panel" />,
  default: () => <div data-testid="conversations-stub" />,
}));
vi.mock('../../features/human/MascotChatPane', () => ({
  default: () => <div data-testid="mascot-chat-pane" />,
}));
vi.mock('../../components/accounts/AddAccountModal', () => ({ default: () => null }));
vi.mock('../../components/accounts/RespondQueuePanel', () => ({ default: () => null }));
vi.mock('../../components/accounts/WebviewHost', () => ({ default: () => null }));
vi.mock('../../components/accounts/providerIcons', () => ({
  AgentIcon: () => <span data-testid="agent-icon" />,
  ProviderIcon: () => <span />,
}));
vi.mock('../../hooks/usePrewarmMostRecentAccount', () => ({
  usePrewarmMostRecentAccount: () => {},
}));
vi.mock('../../services/webviewAccountService', () => ({
  hideWebviewAccount: vi.fn(),
  purgeWebviewAccount: vi.fn(),
  showWebviewAccount: vi.fn(),
  startWebviewAccountService: vi.fn(),
}));
vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../lib/i18n/I18nContext', () => ({ useT: () => ({ t: (key: string) => key }) }));
vi.mock('../../store/providerSurfaceSlice', () => ({
  fetchRespondQueue: () => ({ type: 'providerSurfaces/fetch' }),
}));
vi.mock('../../store/accountsSlice', () => ({
  addAccount: vi.fn((a: unknown) => ({ type: 'accounts/addAccount', payload: a })),
  removeAccount: vi.fn((id: string) => ({ type: 'accounts/removeAccount', payload: id })),
  setActiveAccount: (id: string) => ({ type: 'accounts/setActiveAccount', payload: id }),
  setLastActiveAccount: (id: string) => ({ type: 'accounts/setLastActiveAccount', payload: id }),
}));

/* ── minimal store ─────────────────────────────────────────────────── */
function buildStore(activeAccountId: string | null = null) {
  return configureStore({
    reducer: {
      accounts: (
        state = {
          accounts: {} as Record<string, unknown>,
          order: [] as string[],
          activeAccountId,
          lastActiveAccountId: null,
          unread: {} as Record<string, number>,
        },
        action: { type: string; payload?: unknown }
      ) => {
        if (action.type === 'accounts/setActiveAccount') {
          return { ...state, activeAccountId: action.payload as string };
        }
        return state;
      },
      providerSurfaces: (state = { queue: [], count: 0, status: 'idle', error: null }) => state,
      mascot: (state = { color: 'yellow', speakReplies: true }) => state,
    },
  });
}

function renderWith(activeAccountId: string | null = null) {
  const store = buildStore(activeAccountId);
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/chat']}>
          <Accounts />
        </MemoryRouter>
      </Provider>
    ),
  };
}

describe('Accounts — mascot mode', () => {
  it('renders AgentChatPanel by default (no mascot)', () => {
    renderWith(null);
    expect(screen.getByTestId('agent-chat-panel')).toBeDefined();
    expect(screen.queryByTestId('mascot-chat-pane')).toBeNull();
  });

  it('renders MascotChatPane when mascot is selected', () => {
    renderWith('__mascot__');
    expect(screen.getByTestId('mascot-chat-pane')).toBeDefined();
    expect(screen.queryByTestId('agent-chat-panel')).toBeNull();
  });

  it('switches to mascot mode when the mascot rail button is clicked', () => {
    const { store } = renderWith(null);
    const mascotBtn = screen.getByRole('button', { name: 'accounts.human' });
    fireEvent.click(mascotBtn);
    expect(store.getState().accounts.activeAccountId).toBe('__mascot__');
  });
});
