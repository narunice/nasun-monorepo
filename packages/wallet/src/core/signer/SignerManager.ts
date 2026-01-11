/**
 * SignerManager - Manages active signers
 *
 * Singleton that tracks available signers and the currently active signer.
 * Supports event listeners for React integration via useSyncExternalStore.
 */

import type { SignerAdapter, SignerType, SignerEvent, SignerEventListener } from './types';

class SignerManagerImpl {
  private current: SignerAdapter | null = null;
  private available: Map<SignerType, SignerAdapter> = new Map();
  private listeners: Set<SignerEventListener> = new Set();

  // Snapshot for useSyncExternalStore
  private snapshot: SignerManagerSnapshot = {
    current: null,
    available: [],
  };

  /**
   * Get the currently active signer
   */
  getCurrent(): SignerAdapter | null {
    return this.current;
  }

  /**
   * Get all available signers
   */
  getAvailable(): SignerAdapter[] {
    return Array.from(this.available.values());
  }

  /**
   * Check if a signer type is available
   */
  has(type: SignerType): boolean {
    return this.available.has(type);
  }

  /**
   * Get a specific signer by type
   */
  get(type: SignerType): SignerAdapter | undefined {
    return this.available.get(type);
  }

  /**
   * Register a new signer
   * If no current signer is set, this becomes the current signer
   */
  register(signer: SignerAdapter): void {
    // Update or add the signer
    this.available.set(signer.type, signer);

    // Set as current if no current signer exists
    // or if updating the currently active signer
    if (!this.current || this.current.type === signer.type) {
      this.current = signer;
    }

    this.updateSnapshot();
    this.emit({ type: 'registered', signer });
  }

  /**
   * Switch to a different signer
   * @throws If the signer type is not available
   */
  switchTo(type: SignerType): void {
    const signer = this.available.get(type);
    if (!signer) {
      throw new Error(`Signer not available: ${type}`);
    }

    this.current = signer;
    this.updateSnapshot();
    this.emit({ type: 'switched', signer });
  }

  /**
   * Unregister a signer
   * If the unregistered signer was current, selects another available signer
   */
  unregister(type: SignerType): void {
    const wasCurrentType = this.current?.type === type;
    this.available.delete(type);

    if (wasCurrentType) {
      // Select another available signer, preferring 'local' if available
      const signers = this.getAvailable();
      if (signers.length > 0) {
        const localSigner = signers.find(s => s.type === 'local');
        this.current = localSigner || signers[0];
      } else {
        this.current = null;
      }
    }

    this.updateSnapshot();
    this.emit({ type: 'unregistered', signerType: type });
  }

  /**
   * Clear all signers
   */
  clear(): void {
    this.available.clear();
    this.current = null;
    this.updateSnapshot();
    this.emit({ type: 'cleared' });
  }

  /**
   * Subscribe to signer events
   * Returns an unsubscribe function
   */
  subscribe(listener: SignerEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get snapshot for useSyncExternalStore
   */
  getSnapshot(): SignerManagerSnapshot {
    return this.snapshot;
  }

  /**
   * Subscribe for useSyncExternalStore
   */
  subscribeToStore(callback: () => void): () => void {
    const listener: SignerEventListener = () => callback();
    return this.subscribe(listener);
  }

  private updateSnapshot(): void {
    this.snapshot = {
      current: this.current,
      available: this.getAvailable(),
    };
  }

  private emit(event: SignerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[SignerManager] Event listener error:', err);
      }
    }
  }
}

export interface SignerManagerSnapshot {
  current: SignerAdapter | null;
  available: SignerAdapter[];
}

/**
 * Singleton instance of SignerManager
 */
export const SignerManager = new SignerManagerImpl();
