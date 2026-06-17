/**
 * Tests for IdentitiesSection — the Agent World Identities screen.
 *
 * Three tabs (Register / Registry / Trading). All data flows through the
 * mocked `apiClient` so no real RPC/network calls are made. We exercise every
 * tab, every AsyncState branch (loading / error / payment_required / empty /
 * populated), the handle-availability input + Check flow, and the static
 * register placeholder.
 *
 * All handles / ids / prices below are GENERIC placeholders — no real names.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  type DirectoryIdentityListingsResponse,
  PaymentRequiredError,
} from '../../lib/agentworld/invokeApiClient';
import { apiClient } from '../AgentWorldShell';
import IdentitiesSection from './IdentitiesSection';

// ── Mock apiClient ────────────────────────────────────────────────────────────
// Replace every namespace/method IdentitiesSection calls through.

vi.mock('../AgentWorldShell', () => ({
  apiClient: {
    registry: { get: vi.fn() },
    directoryIdentities: { list: vi.fn() },
    marketplace: { listIdentities: vi.fn(), identityFloor: vi.fn(), recent: vi.fn() },
  },
}));

// Default happy-path resolutions so async hooks settle without unhandled
// rejections. Individual tests override per-case.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.registry.get).mockResolvedValue({ available: true, name: '@placeholder' });
  vi.mocked(apiClient.directoryIdentities.list).mockResolvedValue({ identities: [] });
  vi.mocked(apiClient.marketplace.listIdentities).mockResolvedValue({ identities: [] });
  vi.mocked(apiClient.marketplace.identityFloor).mockResolvedValue({ price: undefined });
  vi.mocked(apiClient.marketplace.recent).mockResolvedValue({ sales: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function gotoTab(name: 'Register' | 'Registry' | 'Trading') {
  return userEvent.click(screen.getByRole('button', { name }));
}

// ── Tab navigation ────────────────────────────────────────────────────────────

describe('tab navigation', () => {
  test('defaults to Register tab', () => {
    render(<IdentitiesSection />);
    expect(screen.getByRole('button', { name: 'Register' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Check handle availability')).toBeInTheDocument();
  });

  test('renders the section description', () => {
    render(<IdentitiesSection />);
    expect(
      screen.getByText(/Claim handles, manage your registry, and trade identities/i)
    ).toBeInTheDocument();
  });

  test('can switch to Registry tab', async () => {
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(screen.getByRole('button', { name: 'Registry' })).toHaveAttribute('data-active', 'true');
    expect(await screen.findByText('Directory identities')).toBeInTheDocument();
  });

  test('can switch to Trading tab', async () => {
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(screen.getByRole('button', { name: 'Trading' })).toHaveAttribute('data-active', 'true');
    expect(await screen.findByText('Floor Prices')).toBeInTheDocument();
  });

  test('clicking the active tab again is a no-op (reducer short-circuit)', async () => {
    render(<IdentitiesSection />);
    await gotoTab('Register');
    expect(screen.getByRole('button', { name: 'Register' })).toHaveAttribute('data-active', 'true');
  });

  test('switching tabs remounts the body (key change clears local state)', async () => {
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    await gotoTab('Register');
    // Back on Register, input should be fresh/empty.
    const input = screen.getByPlaceholderText('Search for a name...') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

// ── Register tab — handle availability ─────────────────────────────────────────

describe('Register tab — handle availability', () => {
  test('Check button is disabled when the input is empty', () => {
    render(<IdentitiesSection />);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  test('sanitizes input to lowercase a-z0-9_ only', async () => {
    render(<IdentitiesSection />);
    const input = screen.getByPlaceholderText('Search for a name...') as HTMLInputElement;
    await userEvent.type(input, 'Ab-C 1@!_d');
    expect(input.value).toBe('abc1_d');
  });

  test('shows "available" result when handle is free', async () => {
    vi.mocked(apiClient.registry.get).mockResolvedValue({ available: true, name: '@freehandle' });
    render(<IdentitiesSection />);
    await userEvent.type(screen.getByPlaceholderText('Search for a name...'), 'freehandle');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('@freehandle is available')).toBeInTheDocument();
    expect(apiClient.registry.get).toHaveBeenCalledWith('@freehandle');
  });

  test('shows "taken" result with truncated cryptoId when handle is taken', async () => {
    vi.mocked(apiClient.registry.get).mockResolvedValue({
      available: false,
      name: '@takenhandle',
      identity: { cryptoId: 'abcdef0123456789deadbeef' },
    });
    render(<IdentitiesSection />);
    await userEvent.type(screen.getByPlaceholderText('Search for a name...'), 'takenhandle');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('@takenhandle is taken')).toBeInTheDocument();
    // cryptoId truncated to first 12 chars + ellipsis
    expect(screen.getByText('abcdef012345...')).toBeInTheDocument();
  });

  test('shows "taken" result without cryptoId when identity is absent', async () => {
    vi.mocked(apiClient.registry.get).mockResolvedValue({ available: false, name: '@takenbare' });
    render(<IdentitiesSection />);
    await userEvent.type(screen.getByPlaceholderText('Search for a name...'), 'takenbare');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('@takenbare is taken')).toBeInTheDocument();
  });

  test('shows error message when the availability check rejects with a plain Error', async () => {
    vi.mocked(apiClient.registry.get).mockRejectedValueOnce(new Error('boom-network'));
    render(<IdentitiesSection />);
    await userEvent.type(screen.getByPlaceholderText('Search for a name...'), 'errhandle');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText(/boom-network/)).toBeInTheDocument();
  });

  test('shows payment-required notice when the check rejects with PaymentRequiredError', async () => {
    vi.mocked(apiClient.registry.get).mockRejectedValueOnce(
      new PaymentRequiredError({ terms: 'x402' })
    );
    render(<IdentitiesSection />);
    await userEvent.type(screen.getByPlaceholderText('Search for a name...'), 'payhandle');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('Payment required to check availability.')).toBeInTheDocument();
  });

  test('submitting via the form (Enter) also triggers the check', async () => {
    vi.mocked(apiClient.registry.get).mockResolvedValue({ available: true, name: '@viaenter' });
    render(<IdentitiesSection />);
    const input = screen.getByPlaceholderText('Search for a name...');
    await userEvent.type(input, 'viaenter{Enter}');
    expect(await screen.findByText('@viaenter is available')).toBeInTheDocument();
  });

  test('renders the pricing tiers and the tiny.place register placeholder', () => {
    render(<IdentitiesSection />);
    expect(screen.getByText('Pricing tiers')).toBeInTheDocument();
    expect(screen.getByText('$250/yr')).toBeInTheDocument();
    expect(screen.getByText('$50/yr')).toBeInTheDocument();
    expect(screen.getByText('$10/yr')).toBeInTheDocument();
    expect(screen.getByText('Register on tiny.place')).toBeInTheDocument();
  });
});

// ── Registry tab ───────────────────────────────────────────────────────────────

describe('Registry tab', () => {
  test('shows the loading state while directory identities load', async () => {
    let resolve!: (v: { identities: never[] }) => void;
    vi.mocked(apiClient.directoryIdentities.list).mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(screen.getByText('Loading identities…')).toBeInTheDocument();
    resolve({ identities: [] });
    expect(
      await screen.findByText(/No directory identities are currently listed/i)
    ).toBeInTheDocument();
  });

  test('shows the empty state when no directory identities are listed', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockResolvedValue({ identities: [] });
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(
      await screen.findByText(/No directory identities are currently listed/i)
    ).toBeInTheDocument();
  });

  test('shows the empty state when identities field is missing entirely', async () => {
    // identities is undefined → nullish-coalesce to [] path
    vi.mocked(apiClient.directoryIdentities.list).mockResolvedValue(
      {} as unknown as { identities: never[] }
    );
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(
      await screen.findByText(/No directory identities are currently listed/i)
    ).toBeInTheDocument();
  });

  test('renders a populated table of directory identities with prices, dates and statuses', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockResolvedValue({
      identities: [
        {
          listingId: 'listing-1',
          name: '@alpha',
          seller: 'seller-one',
          updatedAt: '2026-02-03T00:00:00Z',
          status: 'active',
          price: { amount: '100', asset: 'USDC' },
        },
        // no seller, no price → em-dash fallbacks; non-active status branch
        { listingId: 'listing-2', name: '@beta', updatedAt: 'not-a-date', status: 'pending' },
      ] as unknown as DirectoryIdentityListingsResponse['identities'],
    });
    render(<IdentitiesSection />);
    await gotoTab('Registry');

    expect(await screen.findByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('seller-one')).toBeInTheDocument();
    expect(screen.getByText('100 USDC')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();

    expect(screen.getByText('@beta')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    // invalid date falls back to the raw value
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
    // missing seller + missing price render em-dashes
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  test('renders status fallback of "unknown" when status is absent', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockResolvedValue({
      identities: [
        {
          listingId: 'listing-x',
          name: '@gamma',
          updatedAt: '2026-02-03T00:00:00Z',
          price: { amount: '5', asset: 'USDC' },
        },
      ],
    });
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(await screen.findByText('unknown')).toBeInTheDocument();
  });

  test('shows the error banner when the directory fetch rejects', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockRejectedValueOnce(
      new Error('directory down')
    );
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByText(/directory down/)).toBeInTheDocument();
  });

  test('shows the wallet-locked banner when the error mentions a missing wallet', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockRejectedValueOnce(
      new Error('wallet is not configured')
    );
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(await screen.findByText('Unlock your wallet to use Agent World')).toBeInTheDocument();
  });

  test('shows the wallet-locked banner for missing secret material', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockRejectedValueOnce(
      new Error('wallet secret material is missing')
    );
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(await screen.findByText('Unlock your wallet to use Agent World')).toBeInTheDocument();
  });

  test('shows the payment-required banner when the directory fetch is gated', async () => {
    vi.mocked(apiClient.directoryIdentities.list).mockRejectedValueOnce(
      new PaymentRequiredError({ terms: 'x402' })
    );
    render(<IdentitiesSection />);
    await gotoTab('Registry');
    expect(await screen.findByText('Access requires payment')).toBeInTheDocument();
  });
});

// ── Trading tab — floor prices ─────────────────────────────────────────────────

describe('Trading tab — floor prices', () => {
  test('renders three floor cards (3 / 4 / 5+ chars) with their labels', async () => {
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('3 chars')).toBeInTheDocument();
    expect(screen.getByText('4 chars')).toBeInTheDocument();
    expect(screen.getByText('5+ chars')).toBeInTheDocument();
    expect(screen.getByText('Short handles')).toBeInTheDocument();
    expect(screen.getByText('Compact handles')).toBeInTheDocument();
    expect(screen.getByText('Long-form identities')).toBeInTheDocument();
  });

  test('shows a price when a floor card resolves with a price', async () => {
    vi.mocked(apiClient.marketplace.identityFloor).mockImplementation((length?: number) => {
      if (length === 3)
        return Promise.resolve({ length: 3, price: { amount: '250', asset: 'USDC' } });
      return Promise.resolve({ length, price: undefined });
    });
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('250 USDC')).toBeInTheDocument();
    // the other two cards resolve without a price → "No floor"
    expect(screen.getAllByText('No floor').length).toBeGreaterThanOrEqual(2);
  });

  test('shows "Unavailable" when a floor card fetch rejects', async () => {
    vi.mocked(apiClient.marketplace.identityFloor).mockRejectedValue(new Error('floor down'));
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect((await screen.findAllByText('Unavailable')).length).toBe(3);
  });
});

// ── Trading tab — listed for sale ──────────────────────────────────────────────

describe('Trading tab — listed for sale', () => {
  test('shows the loading state while listings load', async () => {
    let resolve!: (v: { identities: never[] }) => void;
    vi.mocked(apiClient.marketplace.listIdentities).mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(screen.getByText('Loading listings…')).toBeInTheDocument();
    resolve({ identities: [] });
    expect(await screen.findByText('No identities listed for sale')).toBeInTheDocument();
  });

  test('shows the empty state when no identities are listed for sale', async () => {
    vi.mocked(apiClient.marketplace.listIdentities).mockResolvedValue({ identities: [] });
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('No identities listed for sale')).toBeInTheDocument();
  });

  test('renders listing cards including an auction badge and seller line', async () => {
    vi.mocked(apiClient.marketplace.listIdentities).mockResolvedValue({
      identities: [
        {
          listingId: 'sale-1',
          name: '@forsale',
          price: { amount: '42', asset: 'USDC' },
          listingType: 'auction',
          seller: 'seller-x',
          updatedAt: '2026-02-03T00:00:00Z',
        },
        {
          listingId: 'sale-2',
          name: '@fixedone',
          price: { amount: '7', asset: 'USDC' },
          listingType: 'fixed',
          updatedAt: '2026-02-03T00:00:00Z',
        },
      ],
    });
    render(<IdentitiesSection />);
    await gotoTab('Trading');

    expect(await screen.findByText('@forsale')).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('42 USDC')).toBeInTheDocument();
    expect(screen.getByText('by seller-x')).toBeInTheDocument();

    // fixed listing: no auction badge, no seller line
    expect(screen.getByText('@fixedone')).toBeInTheDocument();
    expect(screen.getByText('7 USDC')).toBeInTheDocument();
  });

  test('shows the payment-required banner when listings are gated', async () => {
    vi.mocked(apiClient.marketplace.listIdentities).mockRejectedValueOnce(
      new PaymentRequiredError({ terms: 'x402' })
    );
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('Access requires payment')).toBeInTheDocument();
  });

  test('shows the error banner when listings fetch rejects', async () => {
    vi.mocked(apiClient.marketplace.listIdentities).mockRejectedValueOnce(
      new Error('listings down')
    );
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByText(/listings down/)).toBeInTheDocument();
  });
});

// ── Trading tab — recent sales ─────────────────────────────────────────────────

describe('Trading tab — recent sales', () => {
  test('shows the loading state while recent sales load', async () => {
    let resolve!: (v: { sales: never[] }) => void;
    vi.mocked(apiClient.marketplace.recent).mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(screen.getByText('Loading sales…')).toBeInTheDocument();
    resolve({ sales: [] });
    expect(await screen.findByText('No recent sales')).toBeInTheDocument();
  });

  test('shows the empty state when there are no recent sales', async () => {
    vi.mocked(apiClient.marketplace.recent).mockResolvedValue({ sales: [] });
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('No recent sales')).toBeInTheDocument();
  });

  test('renders a populated table of recent sales with truncated buyer + date', async () => {
    vi.mocked(apiClient.marketplace.recent).mockResolvedValue({
      sales: [
        {
          saleId: 'sale-a',
          name: '@solddomain',
          price: { amount: '999', asset: 'USDC' },
          buyer: 'buyer0123456789abcdef',
          createdAt: '2026-03-15T12:00:00Z',
        },
      ],
    });
    render(<IdentitiesSection />);
    await gotoTab('Trading');

    expect(await screen.findByText('@solddomain')).toBeInTheDocument();
    expect(screen.getByText('999 USDC')).toBeInTheDocument();
    // buyer truncated to first 12 chars + ellipsis
    expect(screen.getByText('buyer0123456...')).toBeInTheDocument();
    // createdAt sliced to YYYY-MM-DD
    expect(screen.getByText('2026-03-15')).toBeInTheDocument();
  });

  test('shows the sales error message when the recent sales fetch rejects', async () => {
    vi.mocked(apiClient.marketplace.recent).mockRejectedValueOnce(new Error('sales down'));
    render(<IdentitiesSection />);
    await gotoTab('Trading');
    expect(await screen.findByText('Failed to load sales')).toBeInTheDocument();
  });

  test('renders all three Trading sub-views together when populated', async () => {
    vi.mocked(apiClient.marketplace.identityFloor).mockImplementation((length?: number) =>
      length === 3
        ? Promise.resolve({ length: 3, price: { amount: '250', asset: 'USDC' } })
        : Promise.resolve({ length, price: undefined })
    );
    vi.mocked(apiClient.marketplace.listIdentities).mockResolvedValue({
      identities: [
        {
          listingId: 'sale-1',
          name: '@listed',
          price: { amount: '42', asset: 'USDC' },
          listingType: 'fixed',
          updatedAt: '2026-02-03T00:00:00Z',
        },
      ],
    });
    vi.mocked(apiClient.marketplace.recent).mockResolvedValue({
      sales: [
        {
          saleId: 'sale-a',
          name: '@sold',
          price: { amount: '999', asset: 'USDC' },
          buyer: 'buyerabcdef0123456789',
          createdAt: '2026-03-15T12:00:00Z',
        },
      ],
    });
    render(<IdentitiesSection />);
    await gotoTab('Trading');

    const floorSection = screen.getByText('Floor Prices').parentElement as HTMLElement;
    expect(within(floorSection).getByText('250 USDC')).toBeInTheDocument();
    expect(await screen.findByText('@listed')).toBeInTheDocument();
    expect(screen.getByText('@sold')).toBeInTheDocument();
  });
});
