import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MobileTabBar from './MobileTabBar';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>
  );

describe('MobileTabBar', () => {
  beforeEach(() => navigate.mockReset());

  it('renders Chat and Settings tabs', () => {
    renderAt('/chat');
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('no longer renders a Human tab (merged into Chat)', () => {
    renderAt('/chat');
    expect(screen.queryByRole('button', { name: 'Human' })).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-current=page', () => {
    renderAt('/chat');
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  it('treats a deeper /settings/* path as the settings tab being active', () => {
    renderAt('/settings/devices');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('navigates when a tab is clicked', async () => {
    renderAt('/settings');
    await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(navigate).toHaveBeenCalledWith('/chat');
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(navigate).toHaveBeenLastCalledWith('/settings');
  });
});
