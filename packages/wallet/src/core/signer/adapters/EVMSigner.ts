/**
 * EVMSigner - EVM (secp256k1) based signer
 *
 * Uses viem accounts for signing EVM transactions and messages.
 * Supports both HDAccount (from mnemonic) and PrivateKeyAccount.
 */

import type { PrivateKeyAccount, HDAccount } from 'viem/accounts';
import type { TransactionSerializable } from 'viem';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import { DEFAULT_CAPABILITIES } from '../types';

/** Union type for viem account types */
type ViemAccount = PrivateKeyAccount | HDAccount;

export class EVMSigner implements SignerAdapter {
  readonly type = 'evm' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
  };

  /** Current EVM chain ID */
  readonly chainId: number;

  private account: ViemAccount;

  /**
   * Create an EVMSigner from a viem account
   * @param account - viem PrivateKeyAccount or HDAccount
   * @param chainId - EVM chain ID for transaction signing
   */
  constructor(account: ViemAccount, chainId: number) {
    this.account = account;
    this.address = account.address;
    this.chainId = chainId;
  }

  /**
   * Sign serialized transaction bytes
   *
   * Note: For EVM, this expects transaction bytes that can be decoded.
   * For typical EVM flows, use signEVMTransaction() instead.
   *
   * @param txBytes - Serialized transaction bytes
   * @returns Signature result
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    // For EVM, we typically sign transaction objects, not raw bytes
    // This method is included for interface compatibility
    // Convert bytes to hex and sign as message
    const signature = await this.account.signMessage({
      message: { raw: txBytes },
    });
    return { signature };
  }

  /**
   * Sign a personal message (EIP-191)
   *
   * @param message - Message bytes to sign
   * @returns Signature result with hex signature
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    const signature = await this.account.signMessage({
      message: { raw: message },
    });
    return { signature };
  }

  /**
   * Sign an EVM transaction
   *
   * This is the preferred method for signing EVM transactions.
   *
   * @param tx - Transaction parameters
   * @returns Signed transaction hex string
   */
  async signEVMTransaction(tx: TransactionSerializable): Promise<`0x${string}`> {
    return await this.account.signTransaction({
      ...tx,
      chainId: this.chainId,
    } as TransactionSerializable);
  }

  /**
   * Sign typed data (EIP-712)
   *
   * @param typedData - Typed data to sign
   * @returns Signature hex string
   */
  async signTypedData(typedData: {
    domain: {
      name?: string;
      version?: string;
      chainId?: number;
      verifyingContract?: `0x${string}`;
      salt?: `0x${string}`;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`> {
    return await this.account.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  }

  /**
   * Get the underlying viem account
   * Useful for advanced operations
   */
  getAccount(): ViemAccount {
    return this.account;
  }
}
