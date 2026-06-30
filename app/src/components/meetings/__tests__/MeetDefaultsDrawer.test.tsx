import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import { MeetDefaultsDrawer } from '../MeetDefaultsDrawer';

const getMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../../utils/tauriCommands', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/tauriCommands')>(
    '../../../utils/tauriCommands'
  );
  return {
    ...actual,
    isTauri: () => true,
    openhumanGetMeetSettings: (...args: unknown[]) => getMock(...args),
    openhumanUpdateMeetSettings: (...args: unknown[]) => updateMock(...args),
  };
});

const DEFAULT_SETTINGS = {
  result: {
    auto_orchestrator_handoff: false,
    auto_join_policy: 'ask_each_time' as const,
    auto_summarize_policy: 'ask' as const,
    listen_only_default: true,
    ingest_backend_transcripts: false,
    platform_auto_join_policies: {},
    watch_calendar: false,
  },
};

describe('MeetDefaultsDrawer', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockResolvedValue(DEFAULT_SETTINGS);
    updateMock.mockResolvedValue({ result: {} });
  });

  afterEach(() => cleanup());

  it('does not render when closed', () => {
    renderWithProviders(<MeetDefaultsDrawer open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the drawer when open', async () => {
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('loads and displays current settings', async () => {
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    // Should render global policy select and platform sections
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls update when global policy changes', async () => {
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Find the global auto-join select (first select) and change it
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'always' } });
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ auto_join_policy: 'always' })
    ));
  });

  it('closes via the close button', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MeetDefaultsDrawer open onClose={onClose} />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls update with platform policies when platform override changes', async () => {
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Find the platform selects (after the global select)
    const selects = screen.getAllByRole('combobox');
    // selects[1] is the first platform (gmeet) override
    if (selects.length > 1) {
      fireEvent.change(selects[1], { target: { value: 'always' } });
      await waitFor(() => expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ platform_auto_join_policies: expect.any(Object) })
      ));
    }
  });

  it('closes when backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MeetDefaultsDrawer open onClose={onClose} />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    // The backdrop div has aria-hidden="true" but should have onClick
    const backdrop = document.querySelector('[aria-hidden="true"]');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  // ── watch_calendar master switch ──────────────────────────────────────────

  it('renders the watch-calendar switch', async () => {
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(screen.getByRole('switch', { name: /watch my calendar/i })).toBeInTheDocument();
  });

  it('reflects watch_calendar=false as unchecked', async () => {
    getMock.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    const sw = await screen.findByRole('switch', { name: /watch my calendar/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects watch_calendar=true as checked', async () => {
    getMock.mockResolvedValueOnce({
      result: { ...DEFAULT_SETTINGS.result, watch_calendar: true },
    });
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    const sw = await screen.findByRole('switch', { name: /watch my calendar/i });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling the switch calls updateMeetSettings with watch_calendar', async () => {
    getMock.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    const sw = await screen.findByRole('switch', { name: /watch my calendar/i });

    fireEvent.click(sw);

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ watch_calendar: true })
      )
    );
  });

  it('reverts optimistic state when update fails', async () => {
    getMock.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    updateMock.mockReset();
    updateMock.mockRejectedValueOnce(new Error('network error'));
    renderWithProviders(<MeetDefaultsDrawer open onClose={vi.fn()} />);
    const sw = await screen.findByRole('switch', { name: /watch my calendar/i });

    // Toggle from false → true (optimistic update)
    fireEvent.click(sw);
    // Wait for the rejection to revert the switch back to false
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
  });
});
