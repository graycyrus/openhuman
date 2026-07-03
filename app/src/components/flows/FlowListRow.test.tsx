/**
 * FlowListRow (issue B5a) — one saved-flow row on the Workflows list page.
 * Asserts the name/status rendering, the last-run/never-run text, and that
 * each control (toggle, Run, View runs) calls back with the row's `Flow`.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Flow } from '../../services/api/flowsApi';
import { renderWithProviders } from '../../test/test-utils';
import FlowListRow from './FlowListRow';

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'flow-1',
    name: 'Daily digest',
    enabled: true,
    graph: { nodes: [], edges: [] },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_run_at: null,
    last_status: null,
    require_approval: false,
    ...overrides,
  };
}

describe('FlowListRow', () => {
  it('renders the flow name and an Enabled badge when enabled', () => {
    renderWithProviders(
      <FlowListRow flow={makeFlow()} onToggle={vi.fn()} onRun={vi.fn()} onViewRuns={vi.fn()} />
    );

    expect(screen.getByText('Daily digest')).toBeInTheDocument();
    expect(screen.getByTestId('flow-status-flow-1')).toHaveTextContent('Enabled');
  });

  it('renders a Paused badge when disabled', () => {
    renderWithProviders(
      <FlowListRow
        flow={makeFlow({ enabled: false })}
        onToggle={vi.fn()}
        onRun={vi.fn()}
        onViewRuns={vi.fn()}
      />
    );

    expect(screen.getByTestId('flow-status-flow-1')).toHaveTextContent('Paused');
  });

  it('shows "Never run" when the flow has no last_run_at', () => {
    renderWithProviders(
      <FlowListRow flow={makeFlow()} onToggle={vi.fn()} onRun={vi.fn()} onViewRuns={vi.fn()} />
    );

    expect(screen.getByText('Never run')).toBeInTheDocument();
  });

  it('shows the capitalized status and a relative time when the flow has run', () => {
    renderWithProviders(
      <FlowListRow
        flow={makeFlow({ last_run_at: new Date().toISOString(), last_status: 'completed' })}
        onToggle={vi.fn()}
        onRun={vi.fn()}
        onViewRuns={vi.fn()}
      />
    );

    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it('calls onToggle with the flow when the switch is clicked', () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <FlowListRow flow={makeFlow()} onToggle={onToggle} onRun={vi.fn()} onViewRuns={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId('flow-toggle-flow-1'));

    expect(onToggle).toHaveBeenCalledWith(makeFlow());
  });

  it('calls onRun with the flow when the Run button is clicked', () => {
    const onRun = vi.fn();
    renderWithProviders(
      <FlowListRow flow={makeFlow()} onToggle={vi.fn()} onRun={onRun} onViewRuns={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId('flow-run-flow-1'));

    expect(onRun).toHaveBeenCalledWith(makeFlow());
  });

  it('shows the running label and disables Run while busy', () => {
    renderWithProviders(
      <FlowListRow
        flow={makeFlow()}
        onToggle={vi.fn()}
        onRun={vi.fn()}
        onViewRuns={vi.fn()}
        busy="run"
      />
    );

    const runButton = screen.getByTestId('flow-run-flow-1');
    expect(runButton).toHaveTextContent('Running…');
    expect(runButton).toBeDisabled();
  });

  it('disables the toggle while busy=toggle', () => {
    renderWithProviders(
      <FlowListRow
        flow={makeFlow()}
        onToggle={vi.fn()}
        onRun={vi.fn()}
        onViewRuns={vi.fn()}
        busy="toggle"
      />
    );

    expect(screen.getByTestId('flow-toggle-flow-1')).toBeDisabled();
  });

  it('calls onViewRuns with the flow when "View runs" is clicked', () => {
    const onViewRuns = vi.fn();
    renderWithProviders(
      <FlowListRow flow={makeFlow()} onToggle={vi.fn()} onRun={vi.fn()} onViewRuns={onViewRuns} />
    );

    fireEvent.click(screen.getByTestId('flow-view-runs-flow-1'));

    expect(onViewRuns).toHaveBeenCalledWith(makeFlow());
  });
});
