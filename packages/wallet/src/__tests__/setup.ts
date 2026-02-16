// Vitest setup - happy-dom provides localStorage automatically
import { vi } from 'vitest';

// ============================================
// localStorage Mock
// ============================================

// Spy on localStorage methods so tests can assert on calls
vi.spyOn(globalThis.localStorage, 'getItem');
vi.spyOn(globalThis.localStorage, 'setItem');
vi.spyOn(globalThis.localStorage, 'removeItem');
vi.spyOn(globalThis.localStorage, 'clear');

export const localStorageMock = {
  /**
   * Reset localStorage with the given initial data.
   * Pass empty object to clear all data.
   */
  _setStore: (newStore: Record<string, string>) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(newStore)) {
      localStorage.setItem(key, value);
    }
    // Clear call history so tests start fresh
    vi.mocked(localStorage.clear).mockClear();
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.getItem).mockClear();
    vi.mocked(localStorage.removeItem).mockClear();
  },
};

// ============================================
// crypto.subtle Mock (spy-wrapped)
// ============================================

const subtle = globalThis.crypto?.subtle;

export const cryptoSubtleMock = subtle
  ? {
      importKey: vi.spyOn(subtle, 'importKey'),
      deriveKey: vi.spyOn(subtle, 'deriveKey'),
      encrypt: vi.spyOn(subtle, 'encrypt'),
      decrypt: vi.spyOn(subtle, 'decrypt'),
      deriveBits: vi.spyOn(subtle, 'deriveBits'),
      digest: vi.spyOn(subtle, 'digest'),
    }
  : {
      importKey: vi.fn(),
      deriveKey: vi.fn(),
      encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
      decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
      deriveBits: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    };
