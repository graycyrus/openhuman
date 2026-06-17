/**
 * Tests for ProfilesSection — Agent World "your profile" card.
 *
 * The page resolves the wallet's Solana address (`fetchWalletStatus`), reverse-
 * looks-up the handles registered to it (`apiClient.directory.reverse`), and
 * renders one of: loading / wallet_locked / no_handle / payment_required /
 * error / populated card. All handles/ids are GENERIC placeholders.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PaymentRequiredError } from '../../lib/agentworld/invokeApiClient';
import { fetchWalletStatus } from '../../services/walletApi';
import { apiClient } from '../AgentWorldShell';
import ProfilesSection from './ProfilesSection';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../AgentWorldShell', () => ({ apiClient: { directory: { reverse: vi.fn() } } }));
vi.mock('../../services/walletApi', () => ({ fetchWalletStatus: vi.fn() }));

const reverse = vi.mocked(apiClient.directory.reverse);
const walletStatus = vi.mocked(fetchWalletStatus);

const SOLANA_ADDR = 'WaLLetSoLanaAddr0123456789';

function walletWithSolana() {
  return {
    accounts: [
      { chain: 'evm', address: '0xabc', derivationPath: "m/44'/60'/0'/0/0" },
      { chain: 'solana', address: SOLANA_ADDR, derivationPath: "m/44'/501'/0'/0'" },
    ],
  } as unknown as Awaited<ReturnType<typeof fetchWalletStatus>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  walletStatus.mockResolvedValue(walletWithSolana());
  reverse.mockResolvedValue({ cryptoId: SOLANA_ADDR, identities: [] });
});

// ── Loading ───────────────────────────────────────────────────────────────────
describe('loading state', () => {
  test('shows the loading placeholder before resolution', () => {
    walletStatus.mockReturnValue(new Promise(() => {}));
    render(<ProfilesSection />);
    expect(screen.getByText(/Loading your profile…/i)).toBeInTheDocument();
  });
});

// ── Wallet locked ───────────────────────────────────────────────────────────────
describe('wallet_locked state', () => {
  test('prompts to unlock when wallet_status rejects', async () => {
    walletStatus.mockRejectedValueOnce(new Error('the wallet is not configured'));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Unlock your wallet to use Agent World/i)).toBeInTheDocument();
    expect(reverse).not.toHaveBeenCalled();
  });

  test('prompts to unlock when there is no solana account', async () => {
    walletStatus.mockResolvedValueOnce({
      accounts: [{ chain: 'evm', address: '0xabc' }],
    } as unknown as Awaited<ReturnType<typeof fetchWalletStatus>>);
    render(<ProfilesSection />);
    expect(await screen.findByText(/Unlock your wallet to use Agent World/i)).toBeInTheDocument();
  });
});

// ── No handle ───────────────────────────────────────────────────────────────────
describe('no_handle state', () => {
  test('prompts to register when the wallet owns no handle', async () => {
    reverse.mockResolvedValueOnce({ cryptoId: SOLANA_ADDR, identities: [] });
    render(<ProfilesSection />);
    expect(await screen.findByText(/No handle registered yet/i)).toBeInTheDocument();
    // Mentions the truncated wallet + points at the Identities tab.
    expect(screen.getByText(/Register one in the Identities tab/i)).toBeInTheDocument();
    expect(reverse).toHaveBeenCalledWith(SOLANA_ADDR);
  });
});

// ── Payment required / error ───────────────────────────────────────────────────
describe('payment_required + error', () => {
  test('renders the x402 payment message', async () => {
    reverse.mockRejectedValueOnce(new PaymentRequiredError({ terms: 'x402' }));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Access requires payment/i)).toBeInTheDocument();
  });

  test('renders a generic error for an unknown failure', async () => {
    reverse.mockRejectedValueOnce(new Error('boom: backend exploded'));
    render(<ProfilesSection />);
    expect(await screen.findByText(/Failed to load profile/i)).toBeInTheDocument();
    expect(screen.getByText(/boom: backend exploded/i)).toBeInTheDocument();
  });
});

// ── Populated card (the wallet's own handle) ────────────────────────────────────
describe('populated profile card', () => {
  test('renders the owned handle, cryptoId, and registration date', async () => {
    reverse.mockResolvedValueOnce({
      cryptoId: SOLANA_ADDR,
      identities: [
        {
          username: '@myhandle',
          cryptoId: SOLANA_ADDR,
          registeredAt: '2026-06-17T10:56:45.909Z',
          primary: true,
          status: 'active',
        },
      ],
    });
    render(<ProfilesSection />);
    expect(await screen.findByText('@myhandle')).toBeInTheDocument();
    // Truncated cryptoId (len > 12 → first6…last4).
    expect(screen.getByText('WaLLet…6789')).toBeInTheDocument();
    expect(screen.getByText(/Joined Jun 17, 2026/i)).toBeInTheDocument();
    // A bare handle has no published bio/skills.
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
  });

  test('picks the primary handle when the wallet owns several', async () => {
    reverse.mockResolvedValueOnce({
      cryptoId: SOLANA_ADDR,
      identities: [
        { username: '@secondary', cryptoId: SOLANA_ADDR, primary: false },
        { username: '@primaryhandle', cryptoId: SOLANA_ADDR, primary: true },
      ],
    });
    render(<ProfilesSection />);
    expect(await screen.findByText('@primaryhandle')).toBeInTheDocument();
    expect(screen.queryByText('@secondary')).not.toBeInTheDocument();
  });

  test('falls back to the first handle when none is marked primary', async () => {
    reverse.mockResolvedValueOnce({
      cryptoId: SOLANA_ADDR,
      identities: [
        { username: '@firsthandle', cryptoId: SOLANA_ADDR },
        { username: '@otherhandle', cryptoId: SOLANA_ADDR },
      ],
    });
    render(<ProfilesSection />);
    expect(await screen.findByText('@firsthandle')).toBeInTheDocument();
  });
});

// ── Cancellation ────────────────────────────────────────────────────────────────
describe('cancellation', () => {
  test('does not update state after unmount', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof fetchWalletStatus>>) => void;
    walletStatus.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    const { unmount } = render(<ProfilesSection />);
    unmount();
    resolve(walletWithSolana());
    await waitFor(() => expect(walletStatus).toHaveBeenCalled());
  });
});
