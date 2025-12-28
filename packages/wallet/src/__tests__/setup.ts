import { beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
};

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

// Mock crypto.subtle for AES-GCM encryption/decryption
const mockCryptoKey = { type: 'secret' } as CryptoKey;

const cryptoSubtleMock = {
  importKey: vi.fn().mockResolvedValue(mockCryptoKey),
  deriveKey: vi.fn().mockResolvedValue(mockCryptoKey),
  encrypt: vi.fn().mockImplementation(async (_algorithm, _key, data: ArrayBuffer) => {
    // Return the data with a fake 16-byte auth tag appended
    const dataArray = new Uint8Array(data);
    const result = new Uint8Array(dataArray.length + 16);
    result.set(dataArray);
    return result.buffer;
  }),
  decrypt: vi.fn().mockImplementation(async (_algorithm, _key, data: ArrayBuffer) => {
    // Return the data without the last 16 bytes (fake auth tag)
    const dataArray = new Uint8Array(data);
    return dataArray.slice(0, -16).buffer;
  }),
};

const cryptoMock = {
  subtle: cryptoSubtleMock,
  getRandomValues: vi.fn(<T extends ArrayBufferView | null>(array: T): T => {
    if (array instanceof Uint8Array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return array;
  }),
};

// Setup global mocks
beforeEach(() => {
  // Reset storage
  localStorageMock._setStore({});
  sessionStorageMock._setStore({});

  // Stub globals
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('sessionStorage', sessionStorageMock);
  vi.stubGlobal('crypto', cryptoMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// Export mocks for test access
export { localStorageMock, sessionStorageMock, cryptoMock, cryptoSubtleMock };
