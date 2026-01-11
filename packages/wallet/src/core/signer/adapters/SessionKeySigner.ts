/**
 * SessionKeySigner - Session Key Signer for Smart Accounts
 *
 * Wraps a session key to provide limited, time-bound signing capabilities
 * for smart account transactions.
 */

import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import type { ChainConfig } from '../../../config/chains';
import type { SmartAccountTxRequest, SessionKeyState, GasCostEstimate } from '../../aa/types';
import { SessionKeyManager } from '../../aa/session-keys/manager';
import { SmartAccountSigner } from './SmartAccountSigner';

/** Session key capabilities - limited compared to full smart account */
const SESSION_KEY_CAPABILITIES: SignerCapabilities = {
  sessionKeys: false, // Can't create session keys from a session key
  batchSign: true,
  gasSponsorship: true, // Inherits from parent smart account
  requiresHardwareConfirm: false,
};

/**
 * SessionKeySigner - Limited signer for dApp permissions
 *
 * Uses a session key (temporary keypair) to sign transactions on behalf
 * of a smart account, with permission restrictions.
 *
 * @example
 * ```typescript
 * const signer = new SessionKeySigner(
 *   sessionKeyState,
 *   smartAccountSigner,
 *   sessionKeyManager,
 *   'decryption-password'
 * );
 *
 * // Send transaction (validates against permissions)
 * await signer.sendTransaction({ to: '0x...', value: 0n });
 * ```
 */
export class SessionKeySigner implements SignerAdapter {
  readonly type = 'session-key' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = SESSION_KEY_CAPABILITIES;

  private sessionState: SessionKeyState;
  private smartAccountSigner: SmartAccountSigner;
  private manager: SessionKeyManager;
  private keyAccount: PrivateKeyAccount | null = null;
  private decryptionPassword: string;

  /**
   * Create a SessionKeySigner
   *
   * @param sessionState - Session key state from SessionKeyManager
   * @param smartAccountSigner - Parent SmartAccountSigner
   * @param manager - SessionKeyManager instance
   * @param decryptionPassword - Password to decrypt the session key
   */
  constructor(
    sessionState: SessionKeyState,
    smartAccountSigner: SmartAccountSigner,
    manager: SessionKeyManager,
    decryptionPassword: string
  ) {
    this.sessionState = sessionState;
    this.smartAccountSigner = smartAccountSigner;
    this.manager = manager;
    this.decryptionPassword = decryptionPassword;
    this.address = sessionState.address;
  }

  /**
   * Initialize the session key account
   *
   * Decrypts the private key and creates the account for signing.
   * Must be called before using the signer.
   */
  async initialize(): Promise<void> {
    if (this.keyAccount) {
      return; // Already initialized
    }

    // Validate session is still valid
    const validation = this.manager.validateSessionKey(
      this.sessionState.address as Address
    );

    if (!validation.isValid) {
      throw new Error(`Session key invalid: ${validation.reason}`);
    }

    // Decrypt private key
    const privateKey = await this.manager.decryptPrivateKey(
      this.sessionState.address as Address,
      this.decryptionPassword
    );

    this.keyAccount = privateKeyToAccount(privateKey);
  }

  /**
   * Sign raw bytes with the session key
   *
   * @param txBytes - Raw bytes to sign
   * @returns Signature result
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    await this.initialize();

    if (!this.keyAccount) {
      throw new Error('Session key not initialized');
    }

    const signature = await this.keyAccount.signMessage({
      message: { raw: txBytes },
    });

    return { signature };
  }

  /**
   * Sign a personal message (EIP-191)
   *
   * @param message - Message bytes to sign
   * @returns Signature result
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    await this.initialize();

    if (!this.keyAccount) {
      throw new Error('Session key not initialized');
    }

    const signature = await this.keyAccount.signMessage({
      message: { raw: message },
    });

    return { signature };
  }

  /**
   * Send transaction via smart account using session key
   *
   * Validates the transaction against session key permissions
   * before sending through the parent smart account.
   *
   * @param tx - Transaction request
   * @returns Transaction hash
   */
  async sendTransaction(tx: SmartAccountTxRequest): Promise<Hex> {
    // Validate session key is still valid
    const validation = this.manager.validateSessionKey(
      this.sessionState.address as Address
    );

    if (!validation.isValid) {
      throw new Error(`Session key invalid: ${validation.reason}`);
    }

    // Extract function selector from calldata
    const selector = tx.data && tx.data.length >= 10
      ? (tx.data.slice(0, 10) as Hex)
      : undefined;

    // Validate transaction against permissions
    const permissionCheck = this.manager.validateTransaction(
      this.sessionState.address as Address,
      tx.to,
      selector,
      tx.value
    );

    if (!permissionCheck.allowed) {
      throw new Error(`Transaction not allowed: ${permissionCheck.reason}`);
    }

    // Send via smart account
    const hash = await this.smartAccountSigner.sendTransaction(tx);

    // Record transaction
    this.manager.recordTransaction(this.sessionState.address as Address);

    return hash;
  }

  /**
   * Send batch transactions
   *
   * All transactions must be allowed by session key permissions.
   *
   * @param txs - Array of transaction requests
   * @returns Transaction hash
   */
  async sendBatchTransactions(txs: SmartAccountTxRequest[]): Promise<Hex> {
    // Validate all transactions first
    for (const tx of txs) {
      const selector = tx.data && tx.data.length >= 10
        ? (tx.data.slice(0, 10) as Hex)
        : undefined;

      const permissionCheck = this.manager.validateTransaction(
        this.sessionState.address as Address,
        tx.to,
        selector,
        tx.value
      );

      if (!permissionCheck.allowed) {
        throw new Error(`Transaction not allowed: ${permissionCheck.reason}`);
      }
    }

    // Check remaining transaction count
    const validation = this.manager.validateSessionKey(
      this.sessionState.address as Address
    );

    if (!validation.isValid) {
      throw new Error(`Session key invalid: ${validation.reason}`);
    }

    if (
      validation.remainingTxs !== undefined &&
      validation.remainingTxs < txs.length
    ) {
      throw new Error(
        `Insufficient remaining transactions: ${validation.remainingTxs} < ${txs.length}`
      );
    }

    // Send via smart account
    const hash = await this.smartAccountSigner.sendBatchTransactions(txs);

    // Record transactions
    for (let i = 0; i < txs.length; i++) {
      this.manager.recordTransaction(this.sessionState.address as Address);
    }

    return hash;
  }

  /**
   * Estimate gas for a transaction
   *
   * @param tx - Transaction request
   * @returns Gas cost estimate
   */
  async estimateGas(tx: SmartAccountTxRequest): Promise<GasCostEstimate> {
    return this.smartAccountSigner.estimateGas(tx);
  }

  /**
   * Get session key state
   */
  getSessionState(): SessionKeyState {
    return this.sessionState;
  }

  /**
   * Get parent smart account signer
   */
  getSmartAccountSigner(): SmartAccountSigner {
    return this.smartAccountSigner;
  }

  /**
   * Get chain configuration
   */
  getChain(): ChainConfig {
    return this.smartAccountSigner.getChain();
  }

  /**
   * Get smart account address (delegated authority)
   */
  getSmartAccountAddress(): Address {
    return this.smartAccountSigner.getAddress();
  }

  /**
   * Get session key address
   */
  getSessionKeyAddress(): Address {
    return this.sessionState.address as Address;
  }

  /**
   * Check if session is still valid
   */
  isValid(): boolean {
    const validation = this.manager.validateSessionKey(
      this.sessionState.address as Address
    );
    return validation.isValid;
  }

  /**
   * Get remaining validity time in seconds
   */
  getRemainingTime(): number {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, this.sessionState.expiresAt - now);
  }

  /**
   * Get remaining transaction count
   */
  getRemainingTransactions(): number | undefined {
    if (this.sessionState.maxTransactions === undefined) {
      return undefined;
    }
    return Math.max(
      0,
      this.sessionState.maxTransactions - this.sessionState.txCount
    );
  }

  /**
   * Revoke this session key
   */
  revoke(): boolean {
    return this.manager.revokeSessionKey(this.sessionState.address as Address);
  }
}
