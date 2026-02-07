/**
 * Ambient type declarations for Web Crypto API globals.
 *
 * Node.js 20+ exposes CryptoKey and CryptoKeyPair as globals,
 * but @types/node does not declare them in the global scope.
 * These declarations bridge the gap without pulling in lib.dom.d.ts.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */

// CryptoKey is the return type of crypto.subtle.importKey()
interface CryptoKey {
  readonly algorithm: KeyAlgorithm;
  readonly extractable: boolean;
  readonly type: KeyType;
  readonly usages: KeyUsage[];
}

interface CryptoKeyPair {
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
}

type KeyType = 'private' | 'public' | 'secret';
type KeyUsage = 'decrypt' | 'deriveBits' | 'deriveKey' | 'encrypt' | 'sign' | 'unwrapKey' | 'verify' | 'wrapKey';

interface KeyAlgorithm {
  name: string;
}
