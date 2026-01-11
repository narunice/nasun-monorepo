/**
 * Signer Abstraction Layer
 *
 * Provides a unified interface for different signing methods.
 */

// Types
export type {
  SignerType,
  SignerAdapter,
  SignerCapabilities,
  SignatureResult,
  SignerEvent,
  SignerEventListener,
} from './types';
export { DEFAULT_CAPABILITIES } from './types';

// Manager
export { SignerManager } from './SignerManager';
export type { SignerManagerSnapshot } from './SignerManager';

// Adapters
export { LocalSigner, ZkLoginSigner } from './adapters';
