import '@testing-library/jest-dom/vitest';
import { vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

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
  useBalance: vi.fn(() => ({
    data: { totalBalance: '0', formattedBalance: '0', coinCount: 0 },
    isLoading: false,
    error: null,
  })),
  useRefreshBalance: vi.fn(() => vi.fn()),
  useMultiBalance: vi.fn(() => ({
    data: {
      native: { symbol: 'NASUN', balance: 0n, formatted: '0', decimals: 9, type: '0x2::sui::SUI' },
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
  requestFaucet: vi.fn(),
  isValidAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{64}$/.test(addr)),
  shortenAddress: vi.fn((addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`),
  formatBalance: vi.fn((amt: string) => amt),
  getAllTokens: vi.fn(() => [
    { symbol: 'NASUN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  ]),
  NATIVE_TOKEN: { symbol: 'NASUN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
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
