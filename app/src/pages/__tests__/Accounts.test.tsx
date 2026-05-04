import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { store } from '../../store';

// Mock heavy dependencies to keep the test fast and focused on coverage.
vi.mock('../../services/webviewAccountService', () => ({
  startWebviewAccountService: vi.fn(),
  showWebviewAccount: vi.fn(),
  hideWebviewAccount: vi.fn(),
  purgeWebviewAccount: vi.fn(),
}));

vi.mock('../../components/accounts/WebviewHost', () => ({
  default: () => <div data-testid="webview-host" />,
}));

vi.mock('../../components/accounts/AddAccountModal', () => ({ default: () => null }));

vi.mock('../Conversations', () => ({
  AgentChatPanel: () => <div data-testid="agent-chat-panel" />,
}));

// Lazy import after mocks are in place
const { default: Accounts } = await import('../Accounts');

function renderAccounts() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Accounts />
      </MemoryRouter>
    </Provider>
  );
}

describe('Accounts', () => {
  it('renders the agent icon rail and add-app button', () => {
    const { getByLabelText } = renderAccounts();
    expect(getByLabelText('Add app')).toBeInTheDocument();
  });

  it('defaults to the Agent pane when no account is active', () => {
    const { getByTestId } = renderAccounts();
    expect(getByTestId('agent-chat-panel')).toBeInTheDocument();
  });
});
