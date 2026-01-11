/**
 * Session Key Manager
 *
 * Manages session keys for ERC-4337 smart accounts.
 * Session keys provide limited, time-bound permissions for dApps.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import type {
  SessionKeyConfig,
  SessionKeyState,
  SessionKeyPermission,
  SessionKeyValidation,
} from '../types';

/** Storage key prefix for session keys */
const STORAGE_PREFIX = 'nasun_session_keys_';

/** Encryption key derivation iterations */
const PBKDF2_ITERATIONS = 100000;

/**
 * Session Key Manager
 *
 * Provides functionality to create, store, validate, and revoke session keys.
 *
 * @example
 * ```typescript
 * const manager = new SessionKeyManager('0x...smartAccount', 1); // chainId 1
 *
 * // Create a new session key
 * const session = await manager.createSessionKey({
 *   permissions: [{ target: '0x...', selectors: ['0x...'] }],
 *   validityPeriod: 3600, // 1 hour
 *   name: 'Uniswap Trading',
 * }, 'encryption-password');
 *
 * // Validate session key
 * const validation = manager.validateSessionKey(session.address);
 * if (validation.isValid) {
 *   // Use session key for transaction
 * }
 * ```
 */
export class SessionKeyManager {
  private smartAccountAddress: Address;
  private chainId: number;
  private sessions: Map<Address, SessionKeyState> = new Map();

  constructor(smartAccountAddress: Address, chainId: number) {
    this.smartAccountAddress = smartAccountAddress;
    this.chainId = chainId;
    this.loadFromStorage();
  }

  /**
   * Create a new session key
   *
   * Generates a new keypair with the specified permissions and validity period.
   *
   * @param config - Session key configuration
   * @param encryptionPassword - Password to encrypt the private key
   * @returns Created session key state
   */
  async createSessionKey(
    config: SessionKeyConfig,
    encryptionPassword: string
  ): Promise<SessionKeyState> {
    // Generate new keypair
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    // Encrypt private key
    const encryptedPrivateKey = await this.encryptPrivateKey(
      privateKey,
      encryptionPassword
    );

    // Calculate expiration
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + config.validityPeriod;

    // Create session state
    const session: SessionKeyState = {
      address: account.address,
      encryptedPrivateKey,
      permissions: config.permissions,
      createdAt: now,
      expiresAt,
      txCount: 0,
      maxTransactions: config.maxTransactions,
      name: config.name,
      smartAccountAddress: this.smartAccountAddress,
      chainId: this.chainId,
      isRevoked: false,
    };

    // Store session
    this.sessions.set(account.address, session);
    this.saveToStorage();

    return session;
  }

  /**
   * Get a session key by address
   *
   * @param address - Session key address
   * @returns Session key state or null if not found
   */
  getSessionKey(address: Address): SessionKeyState | null {
    return this.sessions.get(address) ?? null;
  }

  /**
   * Get all session keys for this smart account
   *
   * @param includeExpired - Whether to include expired sessions (default: false)
   * @returns Array of session key states
   */
  getAllSessionKeys(includeExpired = false): SessionKeyState[] {
    const now = Math.floor(Date.now() / 1000);
    const sessions = Array.from(this.sessions.values());

    if (includeExpired) {
      return sessions;
    }

    return sessions.filter(
      (s) => !s.isRevoked && s.expiresAt > now
    );
  }

  /**
   * Validate a session key
   *
   * Checks if the session key is valid, not expired, and not revoked.
   *
   * @param address - Session key address
   * @returns Validation result
   */
  validateSessionKey(address: Address): SessionKeyValidation {
    const session = this.sessions.get(address);

    if (!session) {
      return { isValid: false, reason: 'Session key not found' };
    }

    if (session.isRevoked) {
      return { isValid: false, reason: 'Session key has been revoked' };
    }

    const now = Math.floor(Date.now() / 1000);

    if (session.expiresAt <= now) {
      return { isValid: false, reason: 'Session key has expired' };
    }

    if (session.maxTransactions && session.txCount >= session.maxTransactions) {
      return { isValid: false, reason: 'Transaction limit reached' };
    }

    // Check chain ID
    if (session.chainId !== this.chainId) {
      return { isValid: false, reason: 'Session key is for a different chain' };
    }

    // Check smart account
    if (session.smartAccountAddress !== this.smartAccountAddress) {
      return {
        isValid: false,
        reason: 'Session key is for a different smart account',
      };
    }

    const remainingTxs = session.maxTransactions
      ? session.maxTransactions - session.txCount
      : undefined;

    return {
      isValid: true,
      remainingTxs,
      expiresIn: session.expiresAt - now,
    };
  }

  /**
   * Validate a transaction against session key permissions
   *
   * @param sessionAddress - Session key address
   * @param target - Transaction target address
   * @param selector - Function selector (first 4 bytes of calldata)
   * @param value - Transaction value in wei
   * @returns Whether the transaction is allowed
   */
  validateTransaction(
    sessionAddress: Address,
    target: Address,
    selector?: Hex,
    value?: bigint
  ): { allowed: boolean; reason?: string } {
    const session = this.sessions.get(sessionAddress);

    if (!session) {
      return { allowed: false, reason: 'Session key not found' };
    }

    const validation = this.validateSessionKey(sessionAddress);
    if (!validation.isValid) {
      return { allowed: false, reason: validation.reason };
    }

    // Check permissions
    const permission = session.permissions.find(
      (p) => p.target.toLowerCase() === target.toLowerCase()
    );

    if (!permission) {
      return { allowed: false, reason: 'Target contract not allowed' };
    }

    // Check function selector if specified
    if (permission.selectors && permission.selectors.length > 0 && selector) {
      const selectorAllowed = permission.selectors.some(
        (s) => s.toLowerCase() === selector.toLowerCase()
      );
      if (!selectorAllowed) {
        return { allowed: false, reason: 'Function not allowed' };
      }
    }

    // Check value limit
    if (permission.maxValue !== undefined && value !== undefined) {
      if (value > permission.maxValue) {
        return { allowed: false, reason: 'Value exceeds limit' };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a transaction execution
   *
   * Increments the transaction counter for the session key.
   *
   * @param address - Session key address
   */
  recordTransaction(address: Address): void {
    const session = this.sessions.get(address);
    if (session) {
      session.txCount++;
      this.saveToStorage();
    }
  }

  /**
   * Revoke a session key
   *
   * @param address - Session key address to revoke
   * @returns Whether revocation was successful
   */
  revokeSessionKey(address: Address): boolean {
    const session = this.sessions.get(address);
    if (!session) {
      return false;
    }

    session.isRevoked = true;
    this.saveToStorage();
    return true;
  }

  /**
   * Revoke all session keys
   */
  revokeAllSessionKeys(): void {
    for (const session of this.sessions.values()) {
      session.isRevoked = true;
    }
    this.saveToStorage();
  }

  /**
   * Delete expired and revoked session keys
   *
   * Cleans up storage by removing session keys that are no longer valid.
   *
   * @returns Number of sessions removed
   */
  cleanupSessions(): number {
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;

    for (const [address, session] of this.sessions.entries()) {
      if (session.isRevoked || session.expiresAt <= now) {
        this.sessions.delete(address);
        removed++;
      }
    }

    if (removed > 0) {
      this.saveToStorage();
    }

    return removed;
  }

  /**
   * Decrypt session key private key
   *
   * @param address - Session key address
   * @param password - Decryption password
   * @returns Private key hex string
   */
  async decryptPrivateKey(address: Address, password: string): Promise<Hex> {
    const session = this.sessions.get(address);
    if (!session) {
      throw new Error('Session key not found');
    }

    return this.decryptKey(session.encryptedPrivateKey, password);
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Encrypt a private key using AES-256-GCM
   * @internal
   */
  private async encryptPrivateKey(
    privateKey: Hex,
    password: string
  ): Promise<string> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(privateKey)
    );

    // Combine salt + iv + ciphertext
    const combined = new Uint8Array(
      salt.length + iv.length + encrypted.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt a private key
   * @internal
   */
  private async decryptKey(encrypted: string, password: string): Promise<Hex> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return decoder.decode(decrypted) as Hex;
  }

  /**
   * Get storage key for this smart account
   * @internal
   */
  private getStorageKey(): string {
    return `${STORAGE_PREFIX}${this.smartAccountAddress}_${this.chainId}`;
  }

  /**
   * Load sessions from localStorage
   * @internal
   */
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        // Handle BigInt deserialization
        const data = JSON.parse(stored, (_, value) => {
          if (typeof value === 'string' && value.endsWith('n')) {
            const num = value.slice(0, -1);
            if (/^-?\d+$/.test(num)) {
              return BigInt(num);
            }
          }
          return value;
        }) as SessionKeyState[];
        this.sessions = new Map(
          data.map((s) => [s.address as Address, s])
        );
      }
    } catch (error) {
      console.warn('[SessionKeyManager] Failed to load from storage:', error);
    }
  }

  /**
   * Save sessions to localStorage
   * @internal
   */
  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = Array.from(this.sessions.values());
      // Handle BigInt serialization
      const serialized = JSON.stringify(data, (_, value) =>
        typeof value === 'bigint' ? value.toString() + 'n' : value
      );
      localStorage.setItem(this.getStorageKey(), serialized);
    } catch (error) {
      console.warn('[SessionKeyManager] Failed to save to storage:', error);
    }
  }
}

/**
 * Create permission for ERC-20 token transfers
 *
 * @param tokenAddress - Token contract address
 * @param maxAmount - Maximum amount per transfer (in token units)
 * @returns Permission configuration
 */
export function createERC20TransferPermission(
  tokenAddress: Address,
  maxAmount?: bigint
): SessionKeyPermission {
  return {
    target: tokenAddress,
    // transfer(address,uint256) selector
    selectors: ['0xa9059cbb'],
    maxValue: 0n, // No ETH value for ERC-20 transfers
    maxCalls: undefined,
  };
}

/**
 * Create permission for native token transfers
 *
 * @param recipient - Allowed recipient address
 * @param maxValue - Maximum value per transfer (in wei)
 * @returns Permission configuration
 */
export function createNativeTransferPermission(
  recipient: Address,
  maxValue?: bigint
): SessionKeyPermission {
  return {
    target: recipient,
    selectors: [], // Any function (including receive)
    maxValue,
    maxCalls: undefined,
  };
}

/**
 * Create permission for contract interaction
 *
 * @param contractAddress - Contract address
 * @param selectors - Allowed function selectors
 * @param maxValue - Maximum ETH value per call
 * @returns Permission configuration
 */
export function createContractPermission(
  contractAddress: Address,
  selectors: Hex[],
  maxValue?: bigint
): SessionKeyPermission {
  return {
    target: contractAddress,
    selectors,
    maxValue,
    maxCalls: undefined,
  };
}
