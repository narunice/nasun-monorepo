/**
 * WalletConnect Request Handlers
 *
 * Handles signing and transaction requests from connected dApps.
 * Routes requests to appropriate signers based on chain type.
 */

import type { TransactionSerializable } from 'viem';
import type { WCRequest, EVMTransactionParams, SuiTransactionParams } from './types';
import { isEVMChainId, isSuiChainId, getChainIdFromCAIP2 } from './namespaces';
import { SignerManager } from '../signer/SignerManager';
import { EVMSigner } from '../signer/adapters/EVMSigner';
import { getChainByEvmId } from '../../config/chains';
import { getEVMClient } from '../evm/client';
import { getSuiClient } from '../../sui/client';

/**
 * Handle a WalletConnect request
 *
 * Routes the request to the appropriate handler based on chain type
 * and returns the result to send back to the dApp.
 *
 * @param request - The WC request to handle
 * @returns Result to send back to dApp
 * @throws Error if request cannot be handled
 */
export async function handleWCRequest(request: WCRequest): Promise<unknown> {
  if (isEVMChainId(request.chainId)) {
    const chainId = getChainIdFromCAIP2(request.chainId) as number;
    return handleEVMRequest(request, chainId);
  }

  if (isSuiChainId(request.chainId)) {
    const network = getChainIdFromCAIP2(request.chainId) as string;
    return handleSuiRequest(request, network);
  }

  throw new Error(`Unsupported chain: ${request.chainId}`);
}

/**
 * Handle EVM requests (EIP-155)
 */
async function handleEVMRequest(request: WCRequest, chainId: number): Promise<unknown> {
  // Get EVM signer
  const signer = SignerManager.get('evm');
  if (!signer || !(signer instanceof EVMSigner)) {
    throw new Error('EVM signer not available');
  }

  // Get chain config and client
  const chain = getChainByEvmId(chainId);
  if (!chain) {
    throw new Error(`Unsupported EVM chain ID: ${chainId}`);
  }

  const client = getEVMClient(chain);

  switch (request.method) {
    case 'personal_sign': {
      // personal_sign: [message, address]
      const [message, address] = request.params as [string, string];

      // Verify address matches our signer
      if (address.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }

      const messageBytes = hexToBytes(message);
      const { signature } = await signer.signPersonal(messageBytes);
      return signature;
    }

    case 'eth_sign': {
      // eth_sign: [address, message]
      const [address, message] = request.params as [string, string];

      if (address.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }

      const messageBytes = hexToBytes(message);
      const { signature } = await signer.signPersonal(messageBytes);
      return signature;
    }

    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      // eth_signTypedData_v4: [address, typedDataJson]
      const [address, typedDataJson] = request.params as [string, string];

      if (address.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }

      const typedData = JSON.parse(typedDataJson);
      return await signer.signTypedData(typedData);
    }

    case 'eth_sendTransaction': {
      // eth_sendTransaction: [txParams]
      const [txParams] = request.params as [EVMTransactionParams];

      // Verify from address
      if (txParams.from.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }

      // Get nonce
      const nonce = await client.getTransactionCount({
        address: signer.address as `0x${string}`,
      });

      // Estimate gas if not provided
      const gas = txParams.gas
        ? BigInt(txParams.gas)
        : await client.estimateGas({
            account: signer.address as `0x${string}`,
            to: txParams.to as `0x${string}`,
            data: txParams.data as `0x${string}` | undefined,
            value: txParams.value ? BigInt(txParams.value) : undefined,
          });

      // Get gas price if not provided (legacy tx)
      const gasPrice = txParams.gasPrice
        ? BigInt(txParams.gasPrice)
        : txParams.maxFeePerGas
          ? undefined
          : await client.getGasPrice();

      // Build and sign transaction
      const signedTx = await signer.signEVMTransaction({
        to: txParams.to as `0x${string}`,
        data: txParams.data as `0x${string}` | undefined,
        value: txParams.value ? BigInt(txParams.value) : undefined,
        gas,
        gasPrice,
        maxFeePerGas: txParams.maxFeePerGas ? BigInt(txParams.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
          ? BigInt(txParams.maxPriorityFeePerGas)
          : undefined,
        nonce,
      } as TransactionSerializable);

      // Send transaction
      const hash = await client.sendRawTransaction({
        serializedTransaction: signedTx,
      });

      return hash;
    }

    case 'eth_signTransaction': {
      // eth_signTransaction: [txParams]
      const [txParams] = request.params as [EVMTransactionParams];

      if (txParams.from.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }

      const nonce = txParams.nonce
        ? parseInt(txParams.nonce, 16)
        : await client.getTransactionCount({
            address: signer.address as `0x${string}`,
          });

      const gas = txParams.gas
        ? BigInt(txParams.gas)
        : await client.estimateGas({
            account: signer.address as `0x${string}`,
            to: txParams.to as `0x${string}`,
            data: txParams.data as `0x${string}` | undefined,
            value: txParams.value ? BigInt(txParams.value) : undefined,
          });

      const gasPrice = txParams.gasPrice
        ? BigInt(txParams.gasPrice)
        : txParams.maxFeePerGas
          ? undefined
          : await client.getGasPrice();

      const signedTx = await signer.signEVMTransaction({
        to: txParams.to as `0x${string}`,
        data: txParams.data as `0x${string}` | undefined,
        value: txParams.value ? BigInt(txParams.value) : undefined,
        gas,
        gasPrice,
        maxFeePerGas: txParams.maxFeePerGas ? BigInt(txParams.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
          ? BigInt(txParams.maxPriorityFeePerGas)
          : undefined,
        nonce,
      } as TransactionSerializable);

      return signedTx;
    }

    case 'wallet_switchEthereumChain': {
      // wallet_switchEthereumChain: [{ chainId }]
      const [{ chainId: requestedChainId }] = request.params as [{ chainId: string }];
      const targetChainId = parseInt(requestedChainId, 16);

      const targetChain = getChainByEvmId(targetChainId);
      if (!targetChain) {
        throw new Error(`Chain ${targetChainId} not supported`);
      }

      // Return null on success (per EIP-3326)
      return null;
    }

    case 'wallet_addEthereumChain': {
      // We don't support adding custom chains
      throw new Error('Adding custom chains is not supported');
    }

    default:
      throw new Error(`Unsupported EVM method: ${request.method}`);
  }
}

/**
 * Handle Sui/Move requests
 */
async function handleSuiRequest(request: WCRequest, _network: string): Promise<unknown> {
  // Get Sui signer (local or zklogin)
  const signer = SignerManager.get('local') || SignerManager.get('zklogin');
  if (!signer) {
    throw new Error('Sui signer not available');
  }

  const suiClient = getSuiClient();

  switch (request.method) {
    case 'sui_signTransaction': {
      // sui_signTransaction: { transactionBlockBytes }
      const { transactionBlockBytes } = request.params as SuiTransactionParams;

      const txBytes = base64ToBytes(transactionBlockBytes);
      const { signature } = await signer.sign(txBytes);

      return {
        signature,
        transactionBlockBytes,
      };
    }

    case 'sui_signAndExecuteTransaction': {
      // sui_signAndExecuteTransaction: { transactionBlockBytes, options? }
      const { transactionBlockBytes, options } = request.params as SuiTransactionParams;

      const txBytes = base64ToBytes(transactionBlockBytes);
      const { signature } = await signer.sign(txBytes);

      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: {
          showEffects: options?.showEffects ?? true,
          showEvents: options?.showEvents ?? false,
          showObjectChanges: options?.showObjectChanges ?? false,
        },
      });

      return result;
    }

    case 'sui_signMessage': {
      // sui_signMessage: { message }
      const { message } = request.params as { message: string };

      const messageBytes = base64ToBytes(message);
      const { signature } = await signer.signPersonal(messageBytes);

      return {
        signature,
        messageBytes: message,
      };
    }

    default:
      throw new Error(`Unsupported Sui method: ${request.method}`);
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get human-readable description of a request
 */
export function getRequestDescription(request: WCRequest): string {
  switch (request.method) {
    case 'personal_sign':
    case 'eth_sign':
      return 'Sign message';
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4':
      return 'Sign typed data';
    case 'eth_sendTransaction':
      return 'Send transaction';
    case 'eth_signTransaction':
      return 'Sign transaction';
    case 'sui_signTransaction':
      return 'Sign Sui transaction';
    case 'sui_signAndExecuteTransaction':
      return 'Sign and execute Sui transaction';
    case 'sui_signMessage':
      return 'Sign Sui message';
    case 'wallet_switchEthereumChain':
      return 'Switch network';
    case 'wallet_addEthereumChain':
      return 'Add network';
    default:
      return request.method;
  }
}
