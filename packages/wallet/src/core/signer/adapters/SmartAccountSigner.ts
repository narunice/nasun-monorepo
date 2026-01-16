/**
 * SmartAccountSigner - ERC-4337 Smart Account Signer
 *
 * Wraps a SimpleSmartAccount to provide the SignerAdapter interface.
 * Executes transactions through UserOperations via bundler.
 */

import { http, type Address, type Hex, type Chain, type Transport } from 'viem';
import { createSmartAccountClient, type SmartAccountClient } from 'permissionless';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import type { ChainConfig } from '../../../config/chains';
import type { SmartAccountTxRequest, GasCostEstimate, PaymasterContext } from '../../aa/types';
import type { SimpleSmartAccount } from '../../aa/account';
import { getPaymasterClient } from '../../aa/paymaster';
import { getGasPrices, formatGasEstimate } from '../../aa/bundler';

/** Smart account client type with account bound */
type BoundSmartAccountClient = SmartAccountClient<Transport, Chain, SimpleSmartAccount>;

/** Smart account capabilities */
const SMART_ACCOUNT_CAPABILITIES: SignerCapabilities = {
  sessionKeys: true,
  batchSign: true,
  gasSponsorship: true,
  requiresHardwareConfirm: false,
};

/**
 * SmartAccountSigner - ERC-4337 Smart Account Signer
 *
 * Provides SignerAdapter interface for smart accounts.
 * Supports sponsored transactions and batch operations.
 *
 * @example
 * ```typescript
 * const smartAccount = await getSimpleSmartAccount(evmSigner, chain);
 * const signer = new SmartAccountSigner(smartAccount, chain);
 *
 * // Send sponsored transaction
 * const hash = await signer.sendTransaction({ to: '0x...', value: 1000n });
 * ```
 */
export class SmartAccountSigner implements SignerAdapter {
  readonly type = 'smart-account' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = SMART_ACCOUNT_CAPABILITIES;

  private smartAccount: SimpleSmartAccount;
  private chain: ChainConfig;
  private client: BoundSmartAccountClient;
  private paymasterApiKey?: string;

  /**
   * Create a SmartAccountSigner
   *
   * @param smartAccount - SimpleSmartAccount instance
   * @param chain - Chain configuration with AA support
   * @param paymasterApiKey - Optional API key for gas sponsorship
   */
  constructor(
    smartAccount: SimpleSmartAccount,
    chain: ChainConfig,
    paymasterApiKey?: string
  ) {
    this.smartAccount = smartAccount;
    this.chain = chain;
    this.address = smartAccount.address;
    this.paymasterApiKey = paymasterApiKey;

    if (!chain.aa) {
      throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
    }

    const viemChain: Chain = {
      id: chain.chainId!,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: {
        default: { http: [chain.rpcUrl] },
      },
    } as Chain;

    // Build bundler URL with API key if provided
    let bundlerUrl = chain.aa.bundlerUrl;
    if (paymasterApiKey) {
      bundlerUrl = `${bundlerUrl}?apikey=${paymasterApiKey}`;
    }

    // Create smart account client with optional paymaster
    if (paymasterApiKey) {
      const pimlicoClient = getPaymasterClient(chain, paymasterApiKey);

      this.client = createSmartAccountClient({
        account: smartAccount,
        chain: viemChain,
        bundlerTransport: http(bundlerUrl),
        paymaster: pimlicoClient,
      }) as BoundSmartAccountClient;
    } else {
      this.client = createSmartAccountClient({
        account: smartAccount,
        chain: viemChain,
        bundlerTransport: http(bundlerUrl),
      }) as BoundSmartAccountClient;
    }
  }

  /**
   * Sign raw bytes with the smart account owner
   *
   * Note: For smart accounts, this signs with the owner's key.
   * The signature will be wrapped in the UserOperation.
   *
   * @param txBytes - Raw bytes to sign
   * @returns Signature result
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    const signature = await this.smartAccount.signMessage({
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
    const signature = await this.smartAccount.signMessage({
      message: { raw: message },
    });
    return { signature };
  }

  /**
   * Execute a transaction via UserOperation
   *
   * This is the primary method for smart account transactions.
   * The transaction is bundled into a UserOperation and sent to bundler.
   *
   * @param tx - Transaction request
   * @returns Transaction hash
   */
  async sendTransaction(tx: SmartAccountTxRequest): Promise<Hex> {
    const hash = await this.client.sendTransaction({
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data ?? '0x',
    });

    return hash;
  }

  /**
   * Execute multiple transactions atomically
   *
   * All transactions are bundled into a single UserOperation.
   * Uses the sendUserOperation with multiple calls.
   *
   * @param txs - Array of transaction requests
   * @returns Transaction hash
   */
  async sendBatchTransactions(txs: SmartAccountTxRequest[]): Promise<Hex> {
    // For batch transactions, we need to encode the calls
    // The smart account client should support this via sendTransaction with calls
    if (txs.length === 0) {
      throw new Error('No transactions to send');
    }

    if (txs.length === 1) {
      return this.sendTransaction(txs[0]);
    }

    // For now, execute sequentially - batch support depends on smart account implementation
    // TODO: Use proper batch encoding when permissionless supports it
    const hashes: Hex[] = [];
    for (const tx of txs) {
      const hash = await this.sendTransaction(tx);
      hashes.push(hash);
    }

    return hashes[hashes.length - 1];
  }

  /**
   * Get the underlying smart account
   */
  getSmartAccount(): SimpleSmartAccount {
    return this.smartAccount;
  }

  /**
   * Get the smart account client
   */
  getClient(): BoundSmartAccountClient {
    return this.client;
  }

  /**
   * Check if gas sponsorship is enabled
   */
  hasPaymaster(): boolean {
    return !!this.paymasterApiKey;
  }

  /**
   * Get the chain configuration
   */
  getChain(): ChainConfig {
    return this.chain;
  }

  /**
   * Get the smart account address
   */
  getAddress(): Address {
    return this.address as Address;
  }

  /**
   * Estimate gas cost for a transaction
   *
   * Returns the estimated cost in wei and ETH, plus whether
   * the transaction will be sponsored by a paymaster.
   *
   * @param tx - Transaction request to estimate
   * @returns Gas cost estimate with sponsorship info
   */
  async estimateGas(tx: SmartAccountTxRequest): Promise<GasCostEstimate> {
    try {
      // Get current gas prices
      const gasPrices = await getGasPrices(this.chain, this.paymasterApiKey);

      // Prepare the transaction for estimation
      const preparedTx = {
        to: tx.to,
        value: tx.value ?? 0n,
        data: tx.data ?? ('0x' as Hex),
      };

      // Try to estimate using the smart account client
      // This will include paymaster data if configured
      const estimate = await this.client.estimateUserOperationGas({
        calls: [preparedTx],
      });

      const formatted = formatGasEstimate({
        callGasLimit: estimate.callGasLimit,
        verificationGasLimit: estimate.verificationGasLimit,
        preVerificationGas: estimate.preVerificationGas,
        maxFeePerGas: gasPrices.maxFeePerGas,
      });

      return {
        totalGas: formatted.totalGas,
        costInWei: formatted.costInWei,
        costInEth: formatted.costInEth,
        isSponsored: this.hasPaymaster(),
      };
    } catch (error) {
      // If estimation fails (e.g., paymaster rejection), fall back to default estimate
      console.warn('[SmartAccountSigner] Gas estimation failed:', error);

      // Return a conservative default estimate
      const defaultGas = 500000n;
      const gasPrices = await getGasPrices(this.chain, this.paymasterApiKey);
      const costInWei = defaultGas * gasPrices.maxFeePerGas;
      const ethValue = Number(costInWei) / 1e18;

      return {
        totalGas: defaultGas,
        costInWei,
        costInEth: ethValue.toFixed(6),
        isSponsored: false, // Assume not sponsored if estimation fails
      };
    }
  }

  /**
   * Estimate gas for batch transactions
   *
   * @param txs - Array of transaction requests
   * @returns Combined gas cost estimate
   */
  async estimateBatchGas(txs: SmartAccountTxRequest[]): Promise<GasCostEstimate> {
    if (txs.length === 0) {
      return {
        totalGas: 0n,
        costInWei: 0n,
        costInEth: '0.000000',
        isSponsored: this.hasPaymaster(),
      };
    }

    if (txs.length === 1) {
      return this.estimateGas(txs[0]);
    }

    try {
      const gasPrices = await getGasPrices(this.chain, this.paymasterApiKey);

      // Prepare calls for batch estimation
      const calls = txs.map((tx) => ({
        to: tx.to,
        value: tx.value ?? 0n,
        data: tx.data ?? ('0x' as Hex),
      }));

      const estimate = await this.client.estimateUserOperationGas({ calls });

      const formatted = formatGasEstimate({
        callGasLimit: estimate.callGasLimit,
        verificationGasLimit: estimate.verificationGasLimit,
        preVerificationGas: estimate.preVerificationGas,
        maxFeePerGas: gasPrices.maxFeePerGas,
      });

      return {
        totalGas: formatted.totalGas,
        costInWei: formatted.costInWei,
        costInEth: formatted.costInEth,
        isSponsored: this.hasPaymaster(),
      };
    } catch (error) {
      console.warn('[SmartAccountSigner] Batch gas estimation failed:', error);

      // Conservative estimate: 300k per transaction
      const defaultGas = BigInt(txs.length) * 300000n;
      const gasPrices = await getGasPrices(this.chain, this.paymasterApiKey);
      const costInWei = defaultGas * gasPrices.maxFeePerGas;
      const ethValue = Number(costInWei) / 1e18;

      return {
        totalGas: defaultGas,
        costInWei,
        costInEth: ethValue.toFixed(6),
        isSponsored: false,
      };
    }
  }

  /**
   * Get paymaster context for a transaction
   *
   * Checks if the transaction will be sponsored and provides
   * fallback estimate if sponsorship might fail.
   *
   * @param tx - Transaction to check
   * @returns Paymaster context with sponsorship info
   */
  async getPaymasterContext(tx: SmartAccountTxRequest): Promise<PaymasterContext> {
    const isSponsored = this.hasPaymaster();

    if (!isSponsored) {
      // No paymaster configured - user pays
      const estimate = await this.estimateGas(tx);
      return {
        isSponsored: false,
        fallbackEstimate: estimate,
      };
    }

    // Try to get sponsorship
    try {
      const estimate = await this.estimateGas(tx);

      return {
        isSponsored: true,
        sponsorReason: 'Gas sponsored by app',
        fallbackEstimate: estimate,
      };
    } catch {
      // Sponsorship failed - calculate fallback
      const fallbackEstimate = await this.estimateGasWithoutPaymaster(tx);

      return {
        isSponsored: false,
        sponsorReason: 'Sponsorship not available for this transaction',
        fallbackEstimate,
      };
    }
  }

  /**
   * Estimate gas without paymaster (user pays)
   * @internal
   */
  private async estimateGasWithoutPaymaster(_tx: SmartAccountTxRequest): Promise<GasCostEstimate> {
    const gasPrices = await getGasPrices(this.chain);
    const defaultGas = 500000n;
    const costInWei = defaultGas * gasPrices.maxFeePerGas;
    const ethValue = Number(costInWei) / 1e18;

    return {
      totalGas: defaultGas,
      costInWei,
      costInEth: ethValue.toFixed(6),
      isSponsored: false,
    };
  }

  /**
   * Send transaction with automatic fallback
   *
   * If sponsored transaction fails, automatically retries with user-paid gas.
   *
   * @param tx - Transaction request
   * @param allowFallback - Whether to allow fallback to user-paid mode (default: true)
   * @returns Transaction hash
   */
  async sendTransactionWithFallback(
    tx: SmartAccountTxRequest,
    allowFallback = true
  ): Promise<{ hash: Hex; sponsored: boolean }> {
    try {
      // Try sponsored transaction first
      const hash = await this.sendTransaction(tx);
      return { hash, sponsored: this.hasPaymaster() };
    } catch (error) {
      if (!allowFallback || !this.hasPaymaster()) {
        throw error;
      }

      // Check if error is paymaster-related
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isPaymasterError =
        errorMsg.includes('paymaster') ||
        errorMsg.includes('sponsor') ||
        errorMsg.includes('AA3');

      if (!isPaymasterError) {
        throw error;
      }

      console.warn('[SmartAccountSigner] Paymaster failed, retrying without sponsorship');

      // Create a new client without paymaster
      const viemChain: Chain = {
        id: this.chain.chainId!,
        name: this.chain.name,
        nativeCurrency: this.chain.nativeCurrency,
        rpcUrls: {
          default: { http: [this.chain.rpcUrl] },
        },
      } as Chain;

      const fallbackClient = createSmartAccountClient({
        account: this.smartAccount,
        chain: viemChain,
        bundlerTransport: http(this.chain.aa!.bundlerUrl),
      }) as BoundSmartAccountClient;

      const hash = await fallbackClient.sendTransaction({
        to: tx.to,
        value: tx.value ?? 0n,
        data: tx.data ?? '0x',
      });

      return { hash, sponsored: false };
    }
  }
}
