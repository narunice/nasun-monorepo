import { vi, expect, beforeEach, afterEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Mock @nasun/wallet module
vi.mock('@nasun/wallet', () => ({
  useWallet: vi.fn(() => ({
    status: 'disconnected',
    account: null,
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
  })),
  useWalletStatus: vi.fn(() => 'disconnected'),
  useWalletAccount: vi.fn(() => null),
  // zkLogin hooks
  useZkLogin: vi.fn(() => ({
    isConnected: false,
    isLoading: false,
    address: null,
    proof: null,
    state: 'disconnected',
    connect: vi.fn(),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
  })),
  useBalance: vi.fn(() => ({
    data: { totalBalance: '0', formattedBalance: '0', coinCount: 0 },
    isLoading: false,
    error: null,
  })),
  useRefreshBalance: vi.fn(() => vi.fn()),
  useMultiBalance: vi.fn(() => ({
    data: {
      native: { symbol: 'NSN', balance: 0n, formatted: '0', decimals: 9, type: '0x2::sui::SUI' },
      tokens: {},
    },
    isLoading: false,
    error: null,
  })),
  useRefreshMultiBalance: vi.fn(() => vi.fn()),
  useTransaction: vi.fn(() => ({
    sendTransaction: vi.fn(),
    isLoading: false,
    error: null,
    result: null,
    reset: vi.fn(),
  })),
  useTokenTransaction: vi.fn(() => ({
    sendTokenTransaction: vi.fn(),
    isPending: false,
    error: null,
    lastResult: null,
    clearError: vi.fn(),
    clearResult: vi.fn(),
  })),
  // Address book hooks
  useAddressBook: vi.fn(() => ({
    isKnownAddress: vi.fn(() => false),
    isTrustedAddress: vi.fn(() => false),
    getEntry: vi.fn(() => undefined),
    getAllEntries: vi.fn(() => []),
    recordTransaction: vi.fn(),
    updateLabel: vi.fn(),
    trustAddress: vi.fn(),
    untrustAddress: vi.fn(),
    removeAddress: vi.fn(),
  })),
  useAddressStatus: vi.fn(() => ({
    isKnown: false,
    isTrusted: false,
    entry: undefined,
  })),
  // Staking hooks
  useValidators: vi.fn(() => ({
    data: [
      {
        address: '0x' + '1'.repeat(64),
        name: 'Validator 1',
        description: 'Test validator',
        imageUrl: '',
        commissionRate: 0.05,
        stakingPoolSuiBalance: 1000000000000n,
        apy: 0.05,
        isActive: true,
      },
      {
        address: '0x' + '2'.repeat(64),
        name: 'Validator 2',
        description: 'Another validator',
        imageUrl: '',
        commissionRate: 0.10,
        stakingPoolSuiBalance: 500000000000n,
        apy: 0.04,
        isActive: true,
      },
    ],
    isLoading: false,
    error: null,
  })),
  useStaking: vi.fn(() => ({
    stakes: [],
    summary: {
      totalStaked: 0n,
      totalRewards: 0n,
      activeStakeCount: 0,
      pendingStakeCount: 0,
      formattedTotalStaked: '0',
      formattedTotalRewards: '0',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useStakeTransaction: vi.fn(() => ({
    stake: vi.fn(),
    unstake: vi.fn(),
    isLoading: false,
    error: null,
    result: null,
    reset: vi.fn(),
  })),
  // Staking utility functions
  formatStakedAmount: vi.fn((amount: bigint) => {
    if (amount === undefined || amount === null) return '0';
    const value = Number(amount) / 1e9;
    return value.toString();
  }),
  formatApy: vi.fn((apy: number) => `${(apy * 100).toFixed(2)}%`),
  calculateStakingSummary: vi.fn(() => ({
    totalStaked: 0n,
    totalRewards: 0n,
    activeStakeCount: 0,
    pendingStakeCount: 0,
    formattedTotalStaked: '0',
    formattedTotalRewards: '0',
  })),
  // General utilities
  requestFaucet: vi.fn(),
  isValidAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{64}$/.test(addr)),
  shortenAddress: vi.fn((addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`),
  formatBalance: vi.fn((amt: string) => amt),
  getAllTokens: vi.fn(() => [
    { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  ]),
  NATIVE_TOKEN: { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  // Explorer URL helpers
  getExplorerTxUrl: vi.fn((digest: string) => `https://explorer.nasun.io/devnet/tx/${digest}`),
  getExplorerAddressUrl: vi.fn((addr: string) => `https://explorer.nasun.io/devnet/address/${addr}`),
  getExplorerObjectUrl: vi.fn((id: string) => `https://explorer.nasun.io/devnet/object/${id}`),
  // Security settings
  useSecuritySettings: vi.fn(() => ({
    security: {
      autoLockMinutes: 15,
      confirmLargeTransactions: true,
      largeTransactionThreshold: 100,
    },
    updateSecuritySettings: vi.fn(),
  })),
  DEFAULT_SECURITY_SETTINGS: {
    autoLockMinutes: 15,
    confirmLargeTransactions: true,
    largeTransactionThreshold: 100,
  },
  // Clear Signing utilities
  getRiskLevelClass: vi.fn((level: string) => `risk-${level}`),
  getActionIconClass: vi.fn((icon: string) => `icon-${icon}`),
  formatTransaction: vi.fn(() => ({
    title: 'Send Tokens',
    description: 'Transfer 100 USDC to recipient',
    category: 'transfer',
    riskLevel: 'low',
    actions: [
      { type: 'send', label: 'Send', value: '0x1234...', icon: 'arrow-up' },
    ],
    gasCost: '0.003 NSN',
    isSponsored: false,
  })),
  assessRisk: vi.fn(() => ({
    overallRisk: 'low',
    factors: [],
    score: 10,
    requiresExtraConfirmation: false,
  })),
  // Ledger utilities
  useLedger: vi.fn(() => ({
    status: 'disconnected',
    deviceInfo: null,
    address: null,
    publicKey: null,
    derivationPath: null,
    error: null,
    isConnected: false,
    isConnecting: false,
    isSupported: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    setAccountIndex: vi.fn(),
    accountIndex: 0,
    clearError: vi.fn(),
  })),
  useIsLedgerActive: vi.fn(() => false),
  isWebHIDSupported: vi.fn(() => true),
  LEDGER_DERIVATION_PATHS: {
    SUI: (account = 0) => `m/44'/784'/0'/0'/${account}'`,
    EVM: (account = 0) => `44'/60'/0'/0/${account}`,
  },
  // Chain selection
  useChain: vi.fn(() => ({
    chain: {
      id: 'nasun-devnet',
      name: 'Nasun Devnet',
      type: 'move',
      nativeCurrency: { symbol: 'NSN', name: 'Nasun', decimals: 9 },
      rpcUrl: 'https://rpc.devnet.nasun.io',
    },
    isEVM: false,
    isMoveChain: true,
    switchChain: vi.fn(),
    availableChains: [],
  })),
  // EVM hooks
  useEVMBalance: vi.fn(() => ({
    balance: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useEVMTransaction: vi.fn(() => ({
    sendTransfer: vi.fn(),
    isPending: false,
    error: null,
    lastResult: null,
    clearError: vi.fn(),
    clearResult: vi.fn(),
  })),
  useEVMGasEstimate: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  getStoredEVMAddress: vi.fn(() => null),
  getTokenByType: vi.fn((type: string) => {
    if (type === '0x2::sui::SUI') return { symbol: 'NSN', name: 'Nasun', decimals: 9, type };
    return null;
  }),
  // Network hooks
  useNetwork: vi.fn(() => ({
    network: 'devnet',
    rpcUrl: 'https://rpc.devnet.nasun.io',
    switchNetwork: vi.fn(),
  })),
  useWalletLabel: vi.fn(() => ({
    label: '',
    setLabel: vi.fn(),
  })),
}));

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};

// Setup and teardown
beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  localStorageMock.store = {};
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// Export mocks for test access
export { localStorageMock };

// Re-export testing utilities
export * from '@testing-library/react';
