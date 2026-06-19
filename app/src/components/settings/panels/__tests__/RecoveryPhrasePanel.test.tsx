import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WalletStatus } from '../../../../services/walletApi';
import { renderWithProviders } from '../../../../test/test-utils';
import RecoveryPhrasePanel from '../RecoveryPhrasePanel';

// Use vi.hoisted so the factory closures can reference these before module initialisation.
const { mockGenerateMnemonicPhrase, mockFetchWalletStatus, mockPersistLocalWalletFromMnemonic } =
  vi.hoisted(() => ({
    mockGenerateMnemonicPhrase: vi.fn(
      () => 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    ),
    mockFetchWalletStatus: vi.fn(
      async (): Promise<WalletStatus> => ({
        configured: false,
        onboardingCompleted: false,
        consentGranted: false,
        secretStored: false,
        source: null,
        mnemonicWordCount: null,
        accounts: [],
        updatedAtMs: null,
      })
    ),
    mockPersistLocalWalletFromMnemonic: vi.fn(
      async (_args: { force?: boolean; mnemonic?: string; source?: string }) => undefined
    ),
  }));

vi.mock('../../../../utils/cryptoKeys', async importOriginal => {
  const original = await importOriginal<typeof import('../../../../utils/cryptoKeys')>();
  return { ...original, generateMnemonicPhrase: mockGenerateMnemonicPhrase };
});

vi.mock('../../../../providers/CoreStateProvider', () => ({
  useCoreState: () => ({
    snapshot: { currentUser: { _id: 'test-user-id' } },
    setEncryptionKey: vi.fn(async () => undefined),
  }),
}));

// Default: no existing wallet. Individual describe blocks override in beforeEach.
vi.mock('../../../../services/walletApi', () => ({
  fetchWalletStatus: mockFetchWalletStatus,
  setupLocalWallet: vi.fn(async () => ({
    configured: true,
    onboardingCompleted: true,
    consentGranted: true,
    secretStored: true,
    source: 'generated',
    mnemonicWordCount: 12,
    accounts: [],
    updatedAtMs: Date.now(),
  })),
}));

vi.mock('../../../../features/wallet/setupLocalWalletFromMnemonic', () => ({
  persistLocalWalletFromMnemonic: mockPersistLocalWalletFromMnemonic,
}));

// Helper: configured wallet status
const configuredWalletStatus = (): WalletStatus => ({
  configured: true,
  onboardingCompleted: true,
  consentGranted: true,
  secretStored: true,
  source: 'generated',
  mnemonicWordCount: 12,
  accounts: [
    { chain: 'evm', address: '0xabc123', derivationPath: "m/44'/60'/0'/0/0" },
    { chain: 'btc', address: 'bc1qxyz', derivationPath: "m/84'/0'/0'/0/0" },
    { chain: 'solana', address: 'SolAbc', derivationPath: "m/44'/501'/0'/0'" },
    { chain: 'tron', address: 'TronAbc', derivationPath: "m/44'/195'/0'/0/0" },
  ],
  updatedAtMs: 1_700_000_000_000,
});

// Reset to unconfigured wallet between tests
const noWalletStatus = (): WalletStatus => ({
  configured: false,
  onboardingCompleted: false,
  consentGranted: false,
  secretStored: false,
  source: null,
  mnemonicWordCount: null,
  accounts: [],
  updatedAtMs: null,
});

describe('RecoveryPhrasePanel — trust-surface polish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonicPhrase.mockReturnValue(
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    );
    mockFetchWalletStatus.mockResolvedValue(noWalletStatus());
  });

  it('renders the amber warning callout in generate mode', async () => {
    const { container } = renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => expect(screen.queryByText(/can never be recovered if lost/i)).toBeTruthy());
    expect(container.querySelector('.bg-amber-50')).not.toBeNull();
  });

  it('renders import-mode intro copy when switching modes', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/I already have a recovery phrase/i));
    fireEvent.click(screen.getByText(/I already have a recovery phrase/i));
    expect(screen.getByText(/Enter your recovery phrase below/i)).toBeTruthy();
  });

  it('uses palette token text-neutral-700 on the confirm-checkbox label (not opacity)', async () => {
    const { container } = renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/consent to using it for local wallet setup/i));
    const label = screen.getByText(/consent to using it for local wallet setup/i);
    expect(label.className).toContain('text-neutral-700');
    expect(label.className).not.toContain('opacity-80');
    expect(container).toBeTruthy();
  });
});

// Batch-5: recovery/mnemonic mode-switch state reset (pr#1646)
describe('RecoveryPhrasePanel — mode-switch state reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonicPhrase.mockReturnValue(
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    );
    mockFetchWalletStatus.mockResolvedValue(noWalletStatus());
  });

  it('switches to import mode and shows import-mode UI', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/can never be recovered if lost/i));
    expect(screen.getByText(/can never be recovered if lost/i)).toBeTruthy();

    fireEvent.click(screen.getByText(/I already have a recovery phrase/i));
    expect(screen.getByText(/Enter your recovery phrase below/i)).toBeTruthy();
  });

  it('resets confirmed checkbox when switching from generate to import', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByRole('checkbox'));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByText(/I already have a recovery phrase/i));
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.click(screen.getByText(/Generate a new recovery phrase instead/i));
    const regeneratedCheckbox = screen.getByRole('checkbox');
    expect(regeneratedCheckbox).not.toBeChecked();
  });

  it('shows generate-mode UI again after switching back from import', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/I already have a recovery phrase/i));
    fireEvent.click(screen.getByText(/I already have a recovery phrase/i));
    expect(screen.getByText(/Enter your recovery phrase below/i)).toBeTruthy();

    fireEvent.click(screen.getByText(/Generate a new recovery phrase instead/i));
    expect(screen.getByText(/can never be recovered if lost/i)).toBeTruthy();
  });
});

// ── New wallet-safety tests ───────────────────────────────────────────────────

describe('RecoveryPhrasePanel — existing wallet → view mode (no regenerate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonicPhrase.mockReturnValue(
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    );
    mockFetchWalletStatus.mockResolvedValue(configuredWalletStatus());
  });

  it('shows view mode when wallet is already configured', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    // "Your wallet is already set up." — the English translation of mnemonic.walletAlreadyConfigured
    await waitFor(() => expect(screen.queryByText(/Your wallet is already set up/i)).toBeTruthy());
    // No mnemonic reveal button in view mode
    expect(screen.queryByLabelText(/Reveal recovery phrase/i)).toBeNull();
    // No consent checkbox in view mode
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('does NOT call generateMnemonicPhrase when wallet exists', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => expect(screen.queryByText(/Your wallet is already set up/i)).toBeTruthy());
    expect(mockGenerateMnemonicPhrase).not.toHaveBeenCalled();
  });

  it('shows wallet metadata: source and word count labels', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => expect(screen.queryByText(/Source/i)).toBeTruthy());
    expect(screen.getByText(/Recovery phrase length/i)).toBeTruthy();
    expect(screen.getByText(/Last updated/i)).toBeTruthy();
  });

  it('shows account addresses in view mode', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText('0xabc123'));
    expect(screen.getByText('0xabc123')).toBeTruthy();
    expect(screen.getByText('bc1qxyz')).toBeTruthy();
  });
});

describe('RecoveryPhrasePanel — replace-wallet confirmation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonicPhrase.mockReturnValue(
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    );
    mockFetchWalletStatus.mockResolvedValue(configuredWalletStatus());
  });

  it('clicking Replace wallet shows confirmation dialog, not generate mode', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    // Wait for view mode: "Replace wallet" button
    await waitFor(() => screen.getByText(/Replace wallet/i));

    fireEvent.click(screen.getByText(/Replace wallet/i));

    // Warning text for replace
    expect(screen.getByText(/permanently replace your current wallet/i)).toBeTruthy();
    // Confirm button present
    expect(screen.getByText(/I understand, replace my wallet/i)).toBeTruthy();
    // Mnemonic grid not shown yet
    expect(mockGenerateMnemonicPhrase).not.toHaveBeenCalled();
  });

  it('confirming replace enters generate mode and generates a new phrase', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/Replace wallet/i));

    fireEvent.click(screen.getByText(/Replace wallet/i));
    expect(mockGenerateMnemonicPhrase).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(/I understand, replace my wallet/i));

    expect(mockGenerateMnemonicPhrase).toHaveBeenCalledTimes(1);
    await waitFor(() => screen.getByLabelText(/Reveal recovery phrase/i));
  });

  it('cancel in replace-confirm returns to view mode', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/Replace wallet/i));

    fireEvent.click(screen.getByText(/Replace wallet/i));
    fireEvent.click(screen.getByText(/Cancel/i));

    await waitFor(() => screen.getByText(/Your wallet is already set up/i));
    expect(mockGenerateMnemonicPhrase).not.toHaveBeenCalled();
  });
});

describe('RecoveryPhrasePanel — replace save calls persistLocalWalletFromMnemonic with force=true', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonicPhrase.mockReturnValue(
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    );
    mockFetchWalletStatus.mockResolvedValue(configuredWalletStatus());
  });

  it('after replace confirmation, save calls persistLocalWalletFromMnemonic with force=true', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByText(/Replace wallet/i));

    fireEvent.click(screen.getByText(/Replace wallet/i));
    fireEvent.click(screen.getByText(/I understand, replace my wallet/i));

    await waitFor(() => screen.getByLabelText(/Reveal recovery phrase/i));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const saveButton = screen.getByText(/Save Recovery Phrase/i).closest('button')!;
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockPersistLocalWalletFromMnemonic).toHaveBeenCalled());
    const callArgs = mockPersistLocalWalletFromMnemonic.mock.calls[0][0];
    expect(callArgs.force).toBe(true);
  });
});

describe('RecoveryPhrasePanel — no wallet → generate calls persistLocalWalletFromMnemonic without force', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonicPhrase.mockReturnValue(
      'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
    );
    mockFetchWalletStatus.mockResolvedValue(noWalletStatus());
  });

  it('fresh setup saves without force flag', async () => {
    renderWithProviders(<RecoveryPhrasePanel />);
    await waitFor(() => screen.getByRole('checkbox'));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const saveButton = screen.getByText(/Save Recovery Phrase/i).closest('button')!;
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockPersistLocalWalletFromMnemonic).toHaveBeenCalled());
    const callArgs = mockPersistLocalWalletFromMnemonic.mock.calls[0][0];
    expect(callArgs.force).toBeUndefined();
  });
});

describe('RecoveryPhrasePanel — loading state', () => {
  it('shows loading spinner while checking wallet status', () => {
    // fetchWalletStatus never resolves — simulates pending/loading state.
    mockFetchWalletStatus.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<RecoveryPhrasePanel />);
    // "Checking wallet status..." — English translation of mnemonic.loadingWalletStatus
    expect(screen.getByText(/Checking wallet status/i)).toBeTruthy();
  });
});
