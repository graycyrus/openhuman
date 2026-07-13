import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ToolActivityChip from './ToolActivityChip';

vi.mock('../../lib/i18n/I18nContext', () => ({ useT: () => ({ t: (key: string) => key }) }));

describe('ToolActivityChip', () => {
  it('renders the proposing label for propose_workflow', () => {
    render(<ToolActivityChip toolNames={['propose_workflow']} />);
    expect(screen.getByTestId('tool-activity-chip')).toHaveTextContent(
      'flows.copilot.tool.proposing'
    );
  });

  it('renders the proposing label for revise_workflow too', () => {
    render(<ToolActivityChip toolNames={['revise_workflow']} />);
    expect(screen.getByTestId('tool-activity-chip')).toHaveTextContent(
      'flows.copilot.tool.proposing'
    );
  });

  it('renders the dry-running label for dry_run_workflow', () => {
    render(<ToolActivityChip toolNames={['dry_run_workflow']} />);
    expect(screen.getByTestId('tool-activity-chip')).toHaveTextContent(
      'flows.copilot.tool.dryRunning'
    );
  });

  it('renders the saving label for save_workflow', () => {
    render(<ToolActivityChip toolNames={['save_workflow']} />);
    expect(screen.getByTestId('tool-activity-chip')).toHaveTextContent('flows.copilot.tool.saving');
  });

  it('renders a generic "using tools" label for an unrecognized tool name', () => {
    render(<ToolActivityChip toolNames={['some_other_tool']} />);
    expect(screen.getByTestId('tool-activity-chip')).toHaveTextContent(
      'flows.copilot.tool.usingTools'
    );
  });

  it('renders nothing for an empty toolNames array', () => {
    const { container } = render(<ToolActivityChip toolNames={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('picks the first recognized tool label when multiple tool names are present', () => {
    render(<ToolActivityChip toolNames={['some_other_tool', 'save_workflow']} />);
    expect(screen.getByTestId('tool-activity-chip')).toHaveTextContent('flows.copilot.tool.saving');
  });
});
