import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the heavy tab content + chrome so the test exercises only the
// URL-backed tab selection logic in Activity.tsx.
vi.mock('../../lib/i18n/I18nContext', () => ({ useT: () => ({ t: (key: string) => key }) }));
vi.mock('../../components/intelligence/MemorySection', () => ({
  default: () => <div data-testid="tab-memory" />,
}));
vi.mock('../../components/intelligence/IntelligenceSubconsciousTab', () => ({
  default: () => <div data-testid="tab-backgroundActivity" />,
}));
vi.mock('../../components/intelligence/IntelligenceTasksTab', () => ({
  default: () => <div data-testid="tab-tasks" />,
}));
vi.mock('../../components/intelligence/ModelCouncilTab', () => ({
  default: () => <div data-testid="tab-council" />,
}));
vi.mock('../../components/intelligence/WorkflowsTab', () => ({
  default: () => <div data-testid="tab-automations" />,
}));
vi.mock('../../components/intelligence/IntelligenceAgentsTab', () => ({
  default: () => <div data-testid="tab-agents" />,
}));
vi.mock('../../components/intelligence/Toast', () => ({ ToastContainer: () => null }));
vi.mock('../../components/intelligence/ConfirmationModal', () => ({
  ConfirmationModal: () => null,
}));
vi.mock('../../hooks/useIntelligenceSocket', () => ({
  useIntelligenceSocket: () => ({ isConnected: true }),
  useIntelligenceSocketManager: () => ({ connect: vi.fn() }),
}));
vi.mock('../../hooks/useSubconscious', () => ({
  useSubconscious: () => ({
    status: 'idle',
    mode: 'manual',
    intervalMinutes: 30,
    triggering: false,
    settingMode: false,
    triggerTick: vi.fn(),
    setMode: vi.fn(),
    setIntervalMinutes: vi.fn(),
  }),
}));

// `useDeveloperMode` gates the dev-only tabs (memory, agents, council).
// It combines IS_DEV || developerModePref.  We mock the hook so tests can
// control the gate without a Redux store or build-time flag.
const developerModeHoisted = vi.hoisted(() => ({ value: false }));
vi.mock('../../hooks/useDeveloperMode', () => ({
  useDeveloperMode: () => developerModeHoisted.value,
}));

// IS_DEV is still imported by Activity.tsx for other purposes;
// keep it accessible in case a future test needs it.
const isDev = vi.hoisted(() => ({ value: false }));
vi.mock('../../utils/config', async () => {
  const actual = await vi.importActual<typeof import('../../utils/config')>('../../utils/config');
  return {
    ...actual,
    get IS_DEV() {
      return isDev.value;
    },
  };
});

const Activity = (await import('../Activity')).default;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Activity />
    </MemoryRouter>
  );
}

describe('Activity URL-backed tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDev.value = false;
    developerModeHoisted.value = false;
  });

  it('defaults to the tasks tab when no ?tab is present', async () => {
    renderAt('/activity');
    await waitFor(() => expect(screen.getByTestId('tab-tasks')).toBeInTheDocument());
  });

  it('honours ?tab=tasks from the URL', async () => {
    renderAt('/activity?tab=tasks');
    await waitFor(() => expect(screen.getByTestId('tab-tasks')).toBeInTheDocument());
  });

  it('honours ?tab=automations from the URL', async () => {
    renderAt('/activity?tab=automations');
    await waitFor(() => expect(screen.getByTestId('tab-automations')).toBeInTheDocument());
  });

  it('honours ?tab=backgroundActivity from the URL', async () => {
    renderAt('/activity?tab=backgroundActivity');
    await waitFor(() => expect(screen.getByTestId('tab-backgroundActivity')).toBeInTheDocument());
  });

  it('falls back to tasks for an unknown ?tab value', async () => {
    renderAt('/activity?tab=bogus');
    await waitFor(() => expect(screen.getByTestId('tab-tasks')).toBeInTheDocument());
  });

  it('hides memory tab when developerMode is off (falls back to tasks)', async () => {
    developerModeHoisted.value = false;
    renderAt('/activity?tab=memory');
    await waitFor(() => expect(screen.getByTestId('tab-tasks')).toBeInTheDocument());
    expect(screen.queryByTestId('tab-memory')).not.toBeInTheDocument();
  });

  it('hides agents tab when developerMode is off (falls back to tasks)', async () => {
    developerModeHoisted.value = false;
    renderAt('/activity?tab=agents');
    await waitFor(() => expect(screen.getByTestId('tab-tasks')).toBeInTheDocument());
    expect(screen.queryByTestId('tab-agents')).not.toBeInTheDocument();
  });

  it('hides council tab when developerMode is off (falls back to tasks)', async () => {
    developerModeHoisted.value = false;
    renderAt('/activity?tab=council');
    await waitFor(() => expect(screen.getByTestId('tab-tasks')).toBeInTheDocument());
    expect(screen.queryByTestId('tab-council')).not.toBeInTheDocument();
  });

  it('shows memory tab when developerMode is on', async () => {
    developerModeHoisted.value = true;
    renderAt('/activity?tab=memory');
    await waitFor(() => expect(screen.getByTestId('tab-memory')).toBeInTheDocument());
  });

  it('shows agents tab when developerMode is on', async () => {
    developerModeHoisted.value = true;
    renderAt('/activity?tab=agents');
    await waitFor(() => expect(screen.getByTestId('tab-agents')).toBeInTheDocument());
  });

  it('shows council tab when developerMode is on', async () => {
    developerModeHoisted.value = true;
    renderAt('/activity?tab=council');
    await waitFor(() => expect(screen.getByTestId('tab-council')).toBeInTheDocument());
  });

  it('renders the intelligence-header data-walkthrough anchor', async () => {
    renderAt('/activity');
    await waitFor(() =>
      expect(document.querySelector('[data-walkthrough="intelligence-header"]')).not.toBeNull()
    );
  });
});

describe('Activity tab — prod tab visibility', () => {
  beforeEach(() => {
    isDev.value = false;
    developerModeHoisted.value = false;
  });

  it('does not render memory, agents, or council pills in prod', async () => {
    renderAt('/activity');
    await waitFor(() => screen.getByTestId('tab-tasks'));
    // The pill labels are rendered from i18n keys (the mock returns the key itself).
    // memory, agents, and council are dev-only so their pills must be absent.
    expect(screen.queryByText('memory.tab.memory')).not.toBeInTheDocument();
    expect(screen.queryByText('memory.tab.agents')).not.toBeInTheDocument();
    expect(screen.queryByText('memory.tab.council')).not.toBeInTheDocument();
    // Tasks, Automations, Background activity are always visible.
    // Use getAllByText because the label appears in both the pill and the header.
    expect(screen.getAllByText('memory.tab.tasks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('activity.tabs.automations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('activity.tabs.backgroundActivity').length).toBeGreaterThan(0);
  });

  it('clicking the automations pill switches to the automations tab', async () => {
    renderAt('/activity');
    // getAllByText because the label appears in both pill and header on the active tab.
    await waitFor(() => screen.getAllByText('activity.tabs.automations'));
    // Click the first occurrence (the pill tab button).
    fireEvent.click(screen.getAllByText('activity.tabs.automations')[0]);
    await waitFor(() => expect(screen.getByTestId('tab-automations')).toBeInTheDocument());
  });

  it('clicking the backgroundActivity pill switches to the backgroundActivity tab', async () => {
    renderAt('/activity');
    await waitFor(() => screen.getAllByText('activity.tabs.backgroundActivity'));
    fireEvent.click(screen.getAllByText('activity.tabs.backgroundActivity')[0]);
    await waitFor(() => expect(screen.getByTestId('tab-backgroundActivity')).toBeInTheDocument());
  });
});
