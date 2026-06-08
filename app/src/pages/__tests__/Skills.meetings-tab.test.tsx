import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import '../../test/mockDefaultSkillStatusHooks';
import { renderWithProviders } from '../../test/test-utils';
import Skills from '../Skills';

vi.mock('../../components/skills/MeetingBotsCard', () => ({
  default: () => <div data-testid="meeting-bots-card">Meeting bot CTA</div>,
}));

vi.mock('../../hooks/useChannelDefinitions', () => ({
  useChannelDefinitions: () => ({ definitions: [], loading: false, error: null }),
}));

vi.mock('../../services/api/workflowsApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/api/workflowsApi')>(
    '../../services/api/workflowsApi'
  );
  return {
    ...actual,
    workflowsApi: { ...actual.workflowsApi, listWorkflows: vi.fn().mockResolvedValue([]) },
  };
});

vi.mock('../../lib/composio/hooks', () => ({
  useComposioIntegrations: () => ({
    toolkits: [],
    connectionByToolkit: new Map(),
    refresh: vi.fn(),
    loading: false,
    error: null,
  }),
  useAgentReadyComposioToolkits: () => ({
    agentReady: new Set<string>(),
    loading: true,
    error: null,
  }),
}));

describe('Skills page — Meetings tab (folded into Tools in Phase 2)', () => {
  it('shows the meeting bot CTA inside the Tools tab', () => {
    renderWithProviders(<Skills />, { initialEntries: ['/connections'] });

    expect(screen.queryByTestId('meeting-bots-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));

    expect(screen.getByTestId('meeting-bots-card')).toBeInTheDocument();
  });

  it('supports direct links via legacy ?tab=meetings (normalised to tools)', () => {
    // The old ?tab=meetings alias maps to the new "tools" tab.
    renderWithProviders(<Skills />, { initialEntries: ['/connections?tab=meetings'] });

    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('meeting-bots-card')).toBeInTheDocument();
  });

  it('supports direct links via ?tab=tools', () => {
    renderWithProviders(<Skills />, { initialEntries: ['/connections?tab=tools'] });

    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('meeting-bots-card')).toBeInTheDocument();
  });
});
