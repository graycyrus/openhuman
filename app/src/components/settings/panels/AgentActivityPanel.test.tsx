import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentActivityPanel from './AgentActivityPanel';

const navigateBack = vi.fn();

vi.mock('../hooks/useSettingsNavigation', () => ({
  useSettingsNavigation: () => ({
    navigateBack,
    breadcrumbs: [{ label: 'Settings' }, { label: 'Agents' }],
  }),
}));

const callCoreRpc = vi.fn();
vi.mock('../../../services/coreRpcClient', () => ({
  callCoreRpc: (arg: { method: string; params: unknown }) => callCoreRpc(arg),
}));

function settingsResult(level = 2) {
  return {
    result: {
      level,
      level_label: 'moderate',
      sync_interval_secs: 3600,
      heartbeat_enabled: true,
      subconscious_enabled: true,
      token_budget_per_cycle: null,
      estimated_monthly_cost_min_usd: 1,
      estimated_monthly_cost_max_usd: 5,
    },
  };
}

const costResult = { result: { month: '2026-06', total_cost_usd: 0, total_syncs: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  callCoreRpc.mockImplementation((arg: { method: string }) => {
    switch (arg.method) {
      case 'openhuman.config_get_activity_level_settings':
        return Promise.resolve(settingsResult());
      case 'openhuman.memory_sources_monthly_cost_summary':
        return Promise.resolve(costResult);
      case 'openhuman.config_update_activity_level_settings':
        return Promise.resolve(settingsResult(3));
      default:
        return Promise.reject(new Error(`unexpected method ${arg.method}`));
    }
  });
});

describe('<AgentActivityPanel />', () => {
  it('renders the SettingsHeader (title + back button) and the level options once loaded', async () => {
    render(<AgentActivityPanel />);

    // Header title appears (rendered by the shared SettingsHeader).
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Background activity' })).toBeInTheDocument();
    });
    // The shared header back button is present.
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    // All five activity levels render as selectable buttons.
    expect(screen.getByRole('button', { name: /Off/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Always-on/i })).toBeInTheDocument();
  });

  it('invokes the back handler from the SettingsHeader', async () => {
    render(<AgentActivityPanel />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Background activity' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(navigateBack).toHaveBeenCalledTimes(1);
  });

  it('persists a new level selection via the update RPC', async () => {
    render(<AgentActivityPanel />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Background activity' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /Always-on/i }));

    await waitFor(() => {
      expect(callCoreRpc).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'openhuman.config_update_activity_level_settings',
          params: { level: 'always_on' },
        })
      );
    });
  });
});
