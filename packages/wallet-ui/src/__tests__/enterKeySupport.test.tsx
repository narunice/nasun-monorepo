/**
 * Enter Key Support — comprehensive tests for onKeyDown Enter handlers
 * across all 8 modified wallet-ui components.
 *
 * Pattern under test:
 *   onKeyDown={(e) => e.key === 'Enter' && validationCondition && handler()}
 *
 * Each component section tests:
 *  - Enter with valid state → expected action fires
 *  - Enter with various invalid states → no action
 *  - Non-Enter keys → no action
 *  - Double-submit guard (async handlers only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Shared hoisted mocks ──────────────────────────────────────────
const {
  mockUseWallet,
  mockSendTokenTransaction,
  mockClearError,
  mockClearResult,
  mockTransferNFT,
  mockNFTClearError,
  mockNFTClearResult,
  mockStake,
  mockUnstake,
  mockStakeReset,
  mockGetEVMClient,
  mockGetERC20Metadata,
  mockAddCustomERC20Token,
  mockRefreshERC20,
  mockCreateLink,
  mockClearLinkError,
  mockProposeAddSigner,
  mockAcceptSignerProposal,
  mockFetchSignerProposal,
  mockSetGuardians,
  mockFetchAccountState,
} = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockSendTokenTransaction: vi.fn(),
  mockClearError: vi.fn(),
  mockClearResult: vi.fn(),
  mockTransferNFT: vi.fn(),
  mockNFTClearError: vi.fn(),
  mockNFTClearResult: vi.fn(),
  mockStake: vi.fn(),
  mockUnstake: vi.fn(),
  mockStakeReset: vi.fn(),
  mockGetEVMClient: vi.fn(),
  mockGetERC20Metadata: vi.fn(),
  mockAddCustomERC20Token: vi.fn(),
  mockRefreshERC20: vi.fn(),
  mockCreateLink: vi.fn(),
  mockClearLinkError: vi.fn(),
  mockProposeAddSigner: vi.fn(),
  mockAcceptSignerProposal: vi.fn(),
  mockFetchSignerProposal: vi.fn(),
  mockSetGuardians: vi.fn(),
  mockFetchAccountState: vi.fn(),
}));

// Valid Sui address (0x + 64 hex chars)
const VALID_SUI = '0x' + 'a'.repeat(64);
const VALID_SUI_2 = '0x' + 'b'.repeat(64);
const VALID_SUI_3 = '0x' + 'c'.repeat(64);
// Valid EVM address (0x + 40 hex chars)
const VALID_EVM = '0x' + 'a'.repeat(40);

// ─── Mock @nasun/wallet ────────────────────────────────────────────
// Default chain: Move (Nasun Devnet) — override to EVM in AddERC20Token tests
vi.mock('@nasun/wallet', async () => {
  const { walletMockDefaults } = await import('./setup');
  return {
    ...walletMockDefaults,
    useWallet: () => mockUseWallet(),
    useTokenTransaction: vi.fn(() => ({
      sendTokenTransaction: mockSendTokenTransaction,
      isPending: false,
      error: null,
      lastResult: null,
      clearError: mockClearError,
      clearResult: mockClearResult,
    })),
    useMultiBalance: vi.fn(() => ({
      data: {
        native: { symbol: 'NSN', balance: 1000000000n, formatted: '1.000', decimals: 9, type: '0x2::sui::SUI' },
        tokens: {},
      },
      isLoading: false,
      error: null,
    })),
    useBalance: vi.fn(() => ({
      data: { totalBalance: '1000000000', formattedBalance: '1.000', coinCount: 1 },
      isLoading: false,
      error: null,
    })),
    // NFT hooks
    useNFTTransfer: vi.fn(() => ({
      transferNFT: mockTransferNFT,
      isPending: false,
      error: null,
      lastResult: null,
      clearError: mockNFTClearError,
      clearResult: mockNFTClearResult,
    })),
    getNFTImageUrl: vi.fn(() => ''),
    // Staking — return 1 validator
    useValidators: vi.fn(() => ({
      data: [
        {
          address: '0x' + '1'.repeat(64),
          name: 'Validator 1',
          description: 'Test',
          imageUrl: '',
          commissionRate: 0.05,
          stakingPoolSuiBalance: 1000000000000n,
          apy: 0.05,
          isActive: true,
        },
      ],
      isLoading: false,
      error: null,
    })),
    useStakeTransaction: vi.fn(() => ({
      stake: mockStake,
      unstake: mockUnstake,
      isLoading: false,
      error: null,
      result: null,
      reset: mockStakeReset,
    })),
    // EVM / ERC-20 (only used by AddERC20Token)
    getEVMClient: mockGetEVMClient,
    getERC20Metadata: mockGetERC20Metadata,
    addCustomERC20Token: mockAddCustomERC20Token,
    useRefreshERC20Balances: vi.fn(() => mockRefreshERC20),
    // NasunLink
    useNasunLink: vi.fn(() => ({
      create: mockCreateLink,
      isLoading: false,
      error: null,
      clearError: mockClearLinkError,
      canCreate: true,
    })),
    // NSA hooks
    useNasunSmartAccount: vi.fn(() => ({
      accountState: {
        signers: [{ address: '0x' + 'd'.repeat(64), weight: 1, label: 'Owner', signerType: 'passkey' }],
        guardians: [],
        threshold: 1,
        recoveryOwner: '',
      },
      isLoading: false,
      error: null,
      proposeAddSigner: mockProposeAddSigner,
      acceptSignerProposal: mockAcceptSignerProposal,
      setGuardians: mockSetGuardians,
      refreshIncomingInvitations: vi.fn(),
    })),
    useSigner: vi.fn(() => ({
      signer: { address: '0x' + 'd'.repeat(64), sign: vi.fn() },
      address: '0x' + 'd'.repeat(64),
    })),
    fetchSignerProposal: mockFetchSignerProposal,
    fetchAccountState: mockFetchAccountState,
    // Keep default useChain from walletMockDefaults (Move chain)
    // AddERC20Token tests override via vi.mocked()
  };
});

// ─── Imports (after mock) ──────────────────────────────────────────
import * as walletModule from '@nasun/wallet';
import { SendTransaction } from '../transaction/SendTransaction';
import { NFTTransfer } from '../nft/NFTTransfer';
import { StakingPanel } from '../staking/StakingPanel';
import { AddERC20Token } from '../balance/AddERC20Token';
import { NasunLinkWizard } from '../link/NasunLinkWizard';
import { NsaAddSigner } from '../nsa/NsaAddSigner';
import { NsaAcceptProposal } from '../nsa/NsaAcceptProposal';
import { NsaGuardianSetup } from '../nsa/NsaGuardianSetup';

// ─── Helpers ───────────────────────────────────────────────────────
function pressEnter(el: HTMLElement) {
  fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' });
}

function pressTab(el: HTMLElement) {
  fireEvent.keyDown(el, { key: 'Tab', code: 'Tab' });
}

function pressEscape(el: HTMLElement) {
  fireEvent.keyDown(el, { key: 'Escape', code: 'Escape' });
}

function pressSpace(el: HTMLElement) {
  fireEvent.keyDown(el, { key: ' ', code: 'Space' });
}

const MOCK_NFT = {
  objectId: '0x' + 'f'.repeat(64),
  type: 'test::nft::NFT',
  display: { name: 'Test NFT', description: 'A test NFT', image_url: '' },
  owner: VALID_SUI,
};

// ─── beforeEach ────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockUseWallet.mockReturnValue({
    status: 'unlocked',
    account: { address: VALID_SUI },
    isLoading: false,
    error: null,
    createWallet: vi.fn(),
    createWalletWithBackup: vi.fn(),
    unlockWallet: vi.fn(),
    lockWallet: vi.fn(),
    deleteWallet: vi.fn(),
    importWallet: vi.fn(),
    importFromMnemonic: vi.fn(),
    importFromPrivateKey: vi.fn(),
    exportPrivateKey: vi.fn(),
    clearError: vi.fn(),
  });
});

// ════════════════════════════════════════════════════════════════════
// 1. SendTransaction — Enter on amount input
// ════════════════════════════════════════════════════════════════════
describe('SendTransaction Enter Key', () => {
  function fillForm(address: string, amount: string) {
    const addressInput = screen.getByPlaceholderText('0x...');
    const amountInput = screen.getByPlaceholderText('0.0');
    fireEvent.change(addressInput, { target: { value: address } });
    fireEvent.change(amountInput, { target: { value: amount } });
    return { addressInput, amountInput };
  }

  it('Enter with valid address + amount → shows confirm screen', async () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm(VALID_SUI, '0.5');
    pressEnter(amountInput);

    await waitFor(() => {
      expect(screen.getByText('Confirm Transfer')).toBeDefined();
    });
  });

  it('Enter with empty address → no confirm', () => {
    render(<SendTransaction />);
    const amountInput = screen.getByPlaceholderText('0.0');
    fireEvent.change(amountInput, { target: { value: '0.5' } });
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with invalid address → no confirm', () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm('not-an-address', '0.5');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with zero amount → no confirm', () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm(VALID_SUI, '0');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with empty amount → no confirm', () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm(VALID_SUI, '');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with amount exceeding balance → no confirm', () => {
    render(<SendTransaction />);
    // Balance is 1.000 NSN
    const { amountInput } = fillForm(VALID_SUI, '999');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with negative amount → no confirm', () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm(VALID_SUI, '-1');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Tab key on amount input → no confirm', () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm(VALID_SUI, '0.5');
    pressTab(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Escape key on amount input → no confirm', () => {
    render(<SendTransaction />);
    const { amountInput } = fillForm(VALID_SUI, '0.5');
    pressEscape(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter on recipient input → does not trigger confirm (handler is on amount only)', () => {
    render(<SendTransaction />);
    const { addressInput } = fillForm(VALID_SUI, '0.5');
    pressEnter(addressInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with EVM-format address on Move chain → no confirm (wrong format)', () => {
    render(<SendTransaction />);
    // EVM address (40 hex) on Move chain should fail isValidChainAddress
    const { amountInput } = fillForm(VALID_EVM, '0.5');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. NFTTransfer — Enter on recipient input
// ════════════════════════════════════════════════════════════════════
describe('NFTTransfer Enter Key', () => {
  it('Enter with valid address → shows confirm screen', async () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });
    pressEnter(input);

    await waitFor(() => {
      expect(screen.getByText('Confirm Transfer')).toBeDefined();
    });
  });

  it('Enter with empty address → no confirm', () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    pressEnter(input);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with invalid address → no confirm', () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: 'invalid' } });
    pressEnter(input);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with partial address (too short) → no confirm', () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: '0xabc' } });
    pressEnter(input);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Enter with EVM address (wrong chain format) → no confirm', () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_EVM } });
    pressEnter(input);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Tab key → no confirm', () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });
    pressTab(input);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });

  it('Space key → no confirm', () => {
    render(<NFTTransfer nft={MOCK_NFT} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });
    pressSpace(input);

    expect(screen.queryByText('Confirm Transfer')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. StakingPanel — Enter on stake amount input
// ════════════════════════════════════════════════════════════════════
describe('StakingPanel Enter Key', () => {
  function renderAndSelectValidator() {
    render(<StakingPanel />);
    // Click on a validator to select it (expands the staking form)
    const validator = screen.getByText('Validator 1');
    fireEvent.click(validator);
  }

  it('Enter with valid amount → shows confirm screen', async () => {
    renderAndSelectValidator();

    const amountInput = screen.getByPlaceholderText('0.0');
    fireEvent.change(amountInput, { target: { value: '1.0' } });
    pressEnter(amountInput);

    await waitFor(() => {
      // "Confirm Stake" appears as both heading and button
      expect(screen.getAllByText('Confirm Stake').length).toBeGreaterThan(0);
    });
  });

  it('Enter with empty amount → no confirm', () => {
    renderAndSelectValidator();

    const amountInput = screen.getByPlaceholderText('0.0');
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Stake')).toBeFalsy();
  });

  it('Enter with zero amount → no confirm', () => {
    renderAndSelectValidator();

    const amountInput = screen.getByPlaceholderText('0.0');
    fireEvent.change(amountInput, { target: { value: '0' } });
    pressEnter(amountInput);

    expect(screen.queryByText('Confirm Stake')).toBeFalsy();
  });

  it('Tab key on amount → no confirm', () => {
    renderAndSelectValidator();

    const amountInput = screen.getByPlaceholderText('0.0');
    fireEvent.change(amountInput, { target: { value: '1.0' } });
    pressTab(amountInput);

    expect(screen.queryByText('Confirm Stake')).toBeFalsy();
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. AddERC20Token — Enter on address input
// ════════════════════════════════════════════════════════════════════
describe('AddERC20Token Enter Key', () => {
  beforeEach(() => {
    // Override chain to EVM for this component
    vi.mocked(walletModule.useChain).mockReturnValue({
      chain: {
        id: 'evm-test',
        name: 'Test EVM',
        type: 'evm',
        nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
        rpcUrl: 'http://localhost:8545',
      },
      isEVM: true,
      isMoveChain: false,
      switchChain: vi.fn(),
      availableChains: [],
    } as ReturnType<typeof walletModule.useChain>);
  });

  it('Enter with valid EVM address → triggers lookup', async () => {
    mockGetERC20Metadata.mockResolvedValue({
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    });

    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_EVM } });
    pressEnter(input);

    await waitFor(() => {
      expect(mockGetERC20Metadata).toHaveBeenCalled();
    });
  });

  it('Enter with invalid address → no lookup', () => {
    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: 'invalid' } });
    pressEnter(input);

    expect(mockGetERC20Metadata).not.toHaveBeenCalled();
  });

  it('Enter with empty address → no lookup', () => {
    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    pressEnter(input);

    expect(mockGetERC20Metadata).not.toHaveBeenCalled();
  });

  it('Enter with Sui address format (64 hex) → no lookup (EVM expects 40 hex)', () => {
    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });
    pressEnter(input);

    expect(mockGetERC20Metadata).not.toHaveBeenCalled();
  });

  it('Enter with partial EVM address (too short) → no lookup', () => {
    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: '0x' + 'a'.repeat(38) } });
    pressEnter(input);

    expect(mockGetERC20Metadata).not.toHaveBeenCalled();
  });

  it('Tab key → no lookup', () => {
    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_EVM } });
    pressTab(input);

    expect(mockGetERC20Metadata).not.toHaveBeenCalled();
  });

  it('Enter while already looking up → no duplicate request', async () => {
    // First lookup never resolves (simulates in-progress)
    let resolveFirst!: (v: unknown) => void;
    mockGetERC20Metadata.mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; })
    );

    render(<AddERC20Token onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_EVM } });

    // First Enter triggers lookup
    pressEnter(input);
    await waitFor(() => {
      expect(mockGetERC20Metadata).toHaveBeenCalledTimes(1);
    });

    // Second Enter while loading → isLooking=true guards against it
    pressEnter(input);
    expect(mockGetERC20Metadata).toHaveBeenCalledTimes(1);

    // Resolve to clean up
    resolveFirst({ symbol: 'USDC', name: 'USD Coin', decimals: 6 });
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. NasunLinkWizard — Enter on message (Step 1) and password (Step 2)
// ════════════════════════════════════════════════════════════════════
describe('NasunLinkWizard Enter Key', () => {
  describe('Step 1 — message input', () => {
    it('Enter with valid amount → advances to conditions step', async () => {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      // Enter a valid amount (balance is 1.000 NSN = 1000000000 base units)
      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '0.5' } });

      // Press Enter on the message input (last text input in step 1)
      const messageInput = screen.getByPlaceholderText('Welcome gift!');
      pressEnter(messageInput);

      await waitFor(() => {
        expect(screen.getByText('Link Conditions')).toBeDefined();
      });
    });

    it('Enter with zero amount → no advance (hasEnoughBalance is false)', () => {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      const messageInput = screen.getByPlaceholderText('Welcome gift!');
      pressEnter(messageInput);

      expect(screen.getByText('Send Tokens via Link')).toBeDefined();
      expect(screen.queryByText('Link Conditions')).toBeNull();
    });

    it('Enter with amount exceeding balance → no advance', () => {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '9999' } });

      const messageInput = screen.getByPlaceholderText('Welcome gift!');
      pressEnter(messageInput);

      expect(screen.queryByText('Link Conditions')).toBeNull();
    });

    it('Enter on amount input → does not advance (handler is on message only)', () => {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '0.5' } });
      pressEnter(amountInput);

      expect(screen.queryByText('Link Conditions')).toBeNull();
    });

    it('Enter with message filled + valid amount → advances', async () => {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '0.1' } });

      const messageInput = screen.getByPlaceholderText('Welcome gift!');
      fireEvent.change(messageInput, { target: { value: 'Hello friend!' } });
      pressEnter(messageInput);

      await waitFor(() => {
        expect(screen.getByText('Link Conditions')).toBeDefined();
      });
    });

    it('Tab key on message → does not advance', () => {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '0.5' } });

      const messageInput = screen.getByPlaceholderText('Welcome gift!');
      pressTab(messageInput);

      expect(screen.queryByText('Link Conditions')).toBeNull();
    });
  });

  describe('Step 2 — password input', () => {
    function advanceToStep2() {
      render(<NasunLinkWizard onCancel={vi.fn()} />);

      // Fill amount
      const amountInput = screen.getByPlaceholderText('0.00');
      fireEvent.change(amountInput, { target: { value: '0.5' } });

      // Advance to step 2 via button
      const continueBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(continueBtn);
    }

    it('Enter with password filled → triggers create', async () => {
      advanceToStep2();

      await waitFor(() => {
        expect(screen.getByText('Link Conditions')).toBeDefined();
      });

      // Enable password protection
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Fill password
      const passwordInput = screen.getByPlaceholderText('Enter password');
      fireEvent.change(passwordInput, { target: { value: 'mypassword' } });
      pressEnter(passwordInput);

      // handleCreate should be called
      await waitFor(() => {
        expect(mockCreateLink).toHaveBeenCalled();
      });
    });

    it('Enter with empty password → no create', async () => {
      advanceToStep2();

      await waitFor(() => {
        expect(screen.getByText('Link Conditions')).toBeDefined();
      });

      // Enable password protection
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Don't fill password
      const passwordInput = screen.getByPlaceholderText('Enter password');
      pressEnter(passwordInput);

      expect(mockCreateLink).not.toHaveBeenCalled();
    });

    it('No password field when requirePassword is off', async () => {
      advanceToStep2();

      await waitFor(() => {
        expect(screen.getByText('Link Conditions')).toBeDefined();
      });

      // Password checkbox is not checked by default
      expect(screen.queryByPlaceholderText('Enter password')).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. NsaAddSigner — Enter on weight input
// ════════════════════════════════════════════════════════════════════
describe('NsaAddSigner Enter Key', () => {
  function fillSignerForm(address: string, label: string, weight: string) {
    // Address input: placeholder="0x..."
    const addressInput = screen.getByPlaceholderText('0x...');
    fireEvent.change(addressInput, { target: { value: address } });

    // Label input: placeholder="e.g. MacBook Passkey"
    const labelInput = screen.getByPlaceholderText(/macbook passkey/i);
    fireEvent.change(labelInput, { target: { value: label } });

    // Weight input: type="number"
    const weightInput = screen.getByRole('spinbutton');
    fireEvent.change(weightInput, { target: { value: weight } });

    return { addressInput, labelInput, weightInput };
  }

  it('Enter with valid form → shows confirm screen', async () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { weightInput } = fillSignerForm(VALID_SUI, 'My Backup Key', '2');
    pressEnter(weightInput);

    await waitFor(() => {
      expect(screen.getByText(/review|confirm/i)).toBeDefined();
    });
  });

  it('Enter with invalid address → no confirm', () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { weightInput } = fillSignerForm('0xinvalid', 'Label', '1');
    pressEnter(weightInput);

    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
  });

  it('Enter with empty label → no confirm', () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { weightInput } = fillSignerForm(VALID_SUI, '', '1');
    pressEnter(weightInput);

    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
  });

  it('Enter with max-length label (32 chars) → shows confirm (maxLength enforced by HTML)', async () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    // HTML maxLength={32} truncates to 32 chars, which is still valid
    const { weightInput } = fillSignerForm(VALID_SUI, 'A'.repeat(32), '1');
    pressEnter(weightInput);

    await waitFor(() => {
      expect(screen.getByText(/review|confirm/i)).toBeDefined();
    });
  });

  it('Enter with duplicate address (already a signer) → no confirm', () => {
    const existingSigner = '0x' + 'd'.repeat(64);
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { weightInput } = fillSignerForm(existingSigner, 'Dup', '1');
    pressEnter(weightInput);

    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
  });

  it('Tab key on weight input → no confirm', () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { weightInput } = fillSignerForm(VALID_SUI, 'Key', '1');
    pressTab(weightInput);

    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
  });

  it('Enter on label input → does not trigger confirm', () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { labelInput } = fillSignerForm(VALID_SUI, 'Key', '1');
    pressEnter(labelInput);

    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
  });

  it('Enter on address input → does not trigger confirm', () => {
    render(<NsaAddSigner onClose={vi.fn()} />);
    const { addressInput } = fillSignerForm(VALID_SUI, 'Key', '1');
    pressEnter(addressInput);

    expect(screen.getByPlaceholderText('0x...')).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. NsaAcceptProposal — Enter on proposalId input
// ════════════════════════════════════════════════════════════════════
describe('NsaAcceptProposal Enter Key', () => {
  it('Enter with proposal ID → triggers lookup', async () => {
    mockFetchSignerProposal.mockResolvedValue({
      objectId: VALID_SUI,
      accountId: VALID_SUI_2,
      pendingSigner: '0x' + 'd'.repeat(64),
      signerType: 'passkey',
      weight: 1,
      label: 'New Key',
      proposer: VALID_SUI_3,
      expiresAt: Date.now() + 86400000,
      isExecuted: false,
      isCancelled: false,
    });

    render(<NsaAcceptProposal onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });
    pressEnter(input);

    await waitFor(() => {
      expect(mockFetchSignerProposal).toHaveBeenCalledWith(VALID_SUI);
    });
  });

  it('Enter with empty ID → no lookup', () => {
    render(<NsaAcceptProposal onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    pressEnter(input);

    expect(mockFetchSignerProposal).not.toHaveBeenCalled();
  });

  it('Enter with whitespace-only ID → no lookup', () => {
    render(<NsaAcceptProposal onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: '   ' } });
    pressEnter(input);

    expect(mockFetchSignerProposal).not.toHaveBeenCalled();
  });

  it('Tab key → no lookup', () => {
    render(<NsaAcceptProposal onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });
    pressTab(input);

    expect(mockFetchSignerProposal).not.toHaveBeenCalled();
  });

  it('Enter while already loading → no duplicate lookup', async () => {
    let resolveFirst!: (v: unknown) => void;
    mockFetchSignerProposal.mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; })
    );

    render(<NsaAcceptProposal onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('0x...');
    fireEvent.change(input, { target: { value: VALID_SUI } });

    // First Enter
    pressEnter(input);
    await waitFor(() => {
      expect(mockFetchSignerProposal).toHaveBeenCalledTimes(1);
    });

    // Second Enter while loading → isLoading guards
    pressEnter(input);
    expect(mockFetchSignerProposal).toHaveBeenCalledTimes(1);

    // Resolve to clean up
    resolveFirst({
      objectId: VALID_SUI,
      accountId: VALID_SUI_2,
      pendingSigner: '0x' + 'd'.repeat(64),
      signerType: 'passkey',
      weight: 1,
      label: 'Key',
      proposer: VALID_SUI_3,
      expiresAt: Date.now() + 86400000,
      isExecuted: false,
      isCancelled: false,
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. NsaGuardianSetup — Enter on recovery owner input
// ════════════════════════════════════════════════════════════════════
describe('NsaGuardianSetup Enter Key', () => {
  function fillGuardianForm(guardian1: string, guardian2: string, recoveryOwner?: string) {
    // Guardian inputs have placeholders like "Guardian 1 address (0x...)"
    const inputs = screen.getAllByPlaceholderText(/Guardian \d+ address/);
    if (inputs[0]) fireEvent.change(inputs[0], { target: { value: guardian1 } });
    if (inputs[1]) fireEvent.change(inputs[1], { target: { value: guardian2 } });

    // Recovery owner is the last text input (placeholder is dynamic: "Default: 0xddd..." or "0x...")
    const allTextInputs = screen.getAllByRole('textbox');
    const recoveryInput = allTextInputs[allTextInputs.length - 1];
    if (recoveryOwner !== undefined) {
      fireEvent.change(recoveryInput, { target: { value: recoveryOwner } });
    }

    return { recoveryInput, guardianInputs: inputs };
  }

  it('Enter with 2 valid guardians + recovery owner → shows review', async () => {
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm(VALID_SUI, VALID_SUI_2, VALID_SUI_3);
    pressEnter(recoveryInput);

    await waitFor(() => {
      expect(screen.getByText('Review Guardians')).toBeDefined();
    });
  });

  it('Enter with only 1 valid guardian → no review', () => {
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm(VALID_SUI, 'invalid', VALID_SUI_3);
    pressEnter(recoveryInput);

    expect(screen.queryByText('Review Guardians')).toBeNull();
  });

  it('Enter with 0 valid guardians → no review', () => {
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm('bad1', 'bad2', VALID_SUI_3);
    pressEnter(recoveryInput);

    expect(screen.queryByText('Review Guardians')).toBeNull();
  });

  it('Enter with invalid recovery owner → no review', () => {
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm(VALID_SUI, VALID_SUI_2, 'bad-owner');
    pressEnter(recoveryInput);

    expect(screen.queryByText('Review Guardians')).toBeNull();
  });

  it('Enter with guardian overlapping existing signer → no review', () => {
    const existingSigner = '0x' + 'd'.repeat(64);
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm(existingSigner, VALID_SUI_2, VALID_SUI_3);
    pressEnter(recoveryInput);

    expect(screen.queryByText('Review Guardians')).toBeNull();
  });

  it('Enter with empty recovery owner uses default signer address → shows review', async () => {
    // useSigner returns address 0xddd... → effectiveRecoveryOwner = valid address
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm(VALID_SUI, VALID_SUI_2);
    pressEnter(recoveryInput);

    await waitFor(() => {
      expect(screen.getByText('Review Guardians')).toBeDefined();
    });
  });

  it('Tab key on recovery owner → no review', () => {
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { recoveryInput } = fillGuardianForm(VALID_SUI, VALID_SUI_2, VALID_SUI_3);
    pressTab(recoveryInput);

    expect(screen.queryByText('Review Guardians')).toBeNull();
  });

  it('Enter on guardian address input → does not advance', () => {
    render(<NsaGuardianSetup onClose={vi.fn()} />);
    const { guardianInputs } = fillGuardianForm(VALID_SUI, VALID_SUI_2, VALID_SUI_3);
    pressEnter(guardianInputs[0]);

    expect(screen.queryByText('Review Guardians')).toBeNull();
  });
});
