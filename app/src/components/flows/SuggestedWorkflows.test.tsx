import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowSuggestion } from '../../services/api/flowsApi';
import SuggestedWorkflows from './SuggestedWorkflows';

// Echo i18n keys so assertions can target them directly.
vi.mock('../../lib/i18n/I18nContext', () => ({ useT: () => ({ t: (key: string) => key }) }));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

const api = vi.hoisted(() => ({
  createFlow: vi.fn(),
  discoverWorkflows: vi.fn(),
  listSuggestions: vi.fn(),
  dismissSuggestion: vi.fn(),
  markSuggestionBuilt: vi.fn(),
}));
vi.mock('../../services/api/flowsApi', () => ({
  createFlow: (...a: unknown[]) => api.createFlow(...a),
  discoverWorkflows: (...a: unknown[]) => api.discoverWorkflows(...a),
  listSuggestions: (...a: unknown[]) => api.listSuggestions(...a),
  dismissSuggestion: (...a: unknown[]) => api.dismissSuggestion(...a),
  markSuggestionBuilt: (...a: unknown[]) => api.markSuggestionBuilt(...a),
}));

function suggestion(overrides: Partial<FlowSuggestion> = {}): FlowSuggestion {
  return {
    id: 'sug_1',
    title: 'Auto-file receipts',
    one_liner: 'Add each Gmail receipt to your sheet.',
    rationale: 'You forward receipts weekly.',
    trigger_hint: 'app_event',
    steps_outline: ['Watch Gmail'],
    suggested_connections: ['composio:gmail:c1'],
    suggested_slugs: [],
    build_prompt: 'Build a workflow that files receipts.',
    confidence: 0.8,
    status: 'new',
    created_at: '2026-07-05T00:00:00Z',
    source_run_id: null,
    ...overrides,
  };
}

describe('SuggestedWorkflows', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    api.createFlow = vi.fn().mockResolvedValue({ id: 'flow-1', name: 'Auto-file receipts' });
    api.discoverWorkflows = vi.fn().mockResolvedValue([]);
    api.listSuggestions = vi.fn().mockResolvedValue([]);
    api.dismissSuggestion = vi.fn().mockResolvedValue(true);
    api.markSuggestionBuilt = vi.fn().mockResolvedValue(true);
  });

  it('shows the empty state when there are no suggestions', async () => {
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(api.listSuggestions).toHaveBeenCalledWith('new'));
    expect(screen.getByTestId('flow-suggestions-empty')).toBeInTheDocument();
  });

  it('loads persisted suggestions on mount and renders a card', async () => {
    api.listSuggestions = vi.fn().mockResolvedValue([suggestion()]);
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(screen.getByTestId('flow-suggestion-card')).toBeInTheDocument());
    expect(screen.getByText('Auto-file receipts')).toBeInTheDocument();
  });

  it('runs discovery on Discover click and renders the returned suggestions', async () => {
    api.discoverWorkflows = vi.fn().mockResolvedValue([suggestion({ title: 'Fresh idea' })]);
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(api.listSuggestions).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('flow-suggestions-discover'));

    await waitFor(() => expect(screen.getByText('Fresh idea')).toBeInTheDocument());
    expect(api.discoverWorkflows).toHaveBeenCalledTimes(1);
  });

  it('dismisses a suggestion optimistically and calls the API', async () => {
    api.listSuggestions = vi.fn().mockResolvedValue([suggestion()]);
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(screen.getByTestId('flow-suggestion-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('flow-suggestion-dismiss'));

    await waitFor(() =>
      expect(screen.queryByTestId('flow-suggestion-card')).not.toBeInTheDocument()
    );
    expect(api.dismissSuggestion).toHaveBeenCalledWith('sug_1');
  });

  it('creates a blank flow and navigates to its canvas with a prefill seed on Build this', async () => {
    api.listSuggestions = vi.fn().mockResolvedValue([suggestion()]);
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(screen.getByTestId('flow-suggestion-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('flow-suggestion-build'));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(api.createFlow).toHaveBeenCalledTimes(1);
    const [name, graph, requireApproval] = api.createFlow.mock.calls[0];
    // Named from the suggestion's title, matching WorkflowPromptBar's naming.
    expect(name).toBe('Auto-file receipts');
    // The standard blank graph (single manual trigger) — same as instant-create.
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].kind).toBe('trigger');
    // Suggestion-authored flows require approval by default, same as prompt-bar.
    expect(requireApproval).toBe(true);
    // Navigates with the suggestion's build_prompt as an UNSENT prefill seed —
    // never a `send()`/inline builder turn.
    expect(navigateMock).toHaveBeenCalledWith('/flows/flow-1', {
      state: { copilotPrefill: { text: 'Build a workflow that files receipts.' } },
    });
  });

  it('marks the suggestion built and drops it from the list once the flow is created', async () => {
    api.listSuggestions = vi.fn().mockResolvedValue([suggestion()]);
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(screen.getByTestId('flow-suggestion-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('flow-suggestion-build'));

    await waitFor(() => expect(api.markSuggestionBuilt).toHaveBeenCalledWith('sug_1'));
    // Card dropped from the active list so Scout doesn't immediately re-suggest.
    expect(screen.queryByTestId('flow-suggestion-card')).not.toBeInTheDocument();
  });

  it('surfaces an error and re-enables Build this when createFlow fails', async () => {
    api.listSuggestions = vi.fn().mockResolvedValue([suggestion()]);
    api.createFlow = vi.fn().mockRejectedValue(new Error('boom'));
    render(<SuggestedWorkflows />);
    await waitFor(() => expect(screen.getByTestId('flow-suggestion-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('flow-suggestion-build'));

    const error = await screen.findByTestId('flow-suggestions-error');
    expect(error).toHaveTextContent('flows.suggest.error');
    expect(navigateMock).not.toHaveBeenCalled();
    // The suggestion stays put — nothing was built, so it's not marked/removed.
    expect(screen.getByTestId('flow-suggestion-card')).toBeInTheDocument();
    expect(screen.getByTestId('flow-suggestion-build')).not.toBeDisabled();
  });
});
