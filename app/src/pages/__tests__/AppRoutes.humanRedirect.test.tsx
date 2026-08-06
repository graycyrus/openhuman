/**
 * Desktop `/human` route.
 *
 * The Human page merged into the chat surface, so `/human` is now a back-compat
 * redirect to `/chat`. This renders the REAL `AppRoutes` — the file it replaced
 * declared its own local route tree, so it asserted a hardcoded fixture rather
 * than the app and kept passing after the behaviour it described was removed.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Stub the routed surfaces so this test needs no provider chain — the subject
// here is the route table, not the pages.
vi.mock('../Accounts', () => ({ default: () => <div data-testid="chat-page">chat</div> }));
vi.mock('../../components/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/PublicRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/DefaultRedirect', () => ({ default: () => <div /> }));
vi.mock('../../agentworld/AgentWorldShell', () => ({ default: () => <div /> }));
vi.mock('../../agentworld/pages/AgentWorld', () => ({ default: () => <div /> }));

const AppRoutes = (await import('../../AppRoutes')).default;

/**
 * Renders the resolved pathname.
 *
 * Asserting that the chat page mounted is not enough on its own: `Accounts` is
 * the element for `/chat`, so that assertion would also pass if `/human` had
 * rendered it directly instead of redirecting. This probe pins where the router
 * actually landed.
 */
const LocationProbe = () => <span data-testid="pathname">{useLocation().pathname}</span>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>
  );

describe('Desktop /human route', () => {
  it('redirects /human onto the merged chat surface', () => {
    renderAt('/human');
    expect(screen.getByTestId('pathname')).toHaveTextContent('/chat');
    expect(screen.getByTestId('chat-page')).toBeInTheDocument();
  });

  it('still serves /chat directly', () => {
    renderAt('/chat');
    expect(screen.getByTestId('pathname')).toHaveTextContent('/chat');
    expect(screen.getByTestId('chat-page')).toBeInTheDocument();
  });
});
