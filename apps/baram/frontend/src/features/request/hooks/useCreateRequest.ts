/**
 * useCreateRequest - Hook for creating AI computation requests
 */

import { useState, useCallback } from 'react';
import { useSigner } from '@nasun/wallet';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { BLIND_CONFIG, TOKEN_CONFIG, NETWORK_CONFIG, MODEL_PRICING, ModelId } from '@/config/network';
import type { ExecutorInfo } from './useExecutors';

export type RequestStatus = 'idle' | 'creating' | 'executing' | 'completed' | 'error';

export interface RequestResult {
  requestId: number;
  result: string;
  resultHash: string;
  txDigest: string;
  executionTimeMs: number;
}

export interface UseCreateRequestReturn {
  status: RequestStatus;
  error: string | null;
  result: RequestResult | null;
  createRequest: (prompt: string, model: ModelId, executor: ExecutorInfo) => Promise<void>;
  reset: () => void;
}

/**
 * SHA-256 hash of string content
 */
async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to byte array (browser-compatible)
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Encode prompt as Base64 (MVP "encryption")
 */
function encodePrompt(prompt: string): string {
  return btoa(unescape(encodeURIComponent(prompt)));
}

/**
 * Get NUSDC coins for payment
 */
async function getNusdcCoins(
  client: SuiClient,
  owner: string,
  amount: number
): Promise<{ objectId: string; version: string; digest: string }[]> {
  const coins = await client.getCoins({
    owner,
    coinType: TOKEN_CONFIG.nusdcType,
  });

  if (coins.data.length === 0) {
    throw new Error('No NUSDC coins found. Please get some from the Token Faucet.');
  }

  // Find coins that sum to at least the required amount
  let total = 0;
  const selected = [];
  for (const coin of coins.data) {
    selected.push({
      objectId: coin.coinObjectId,
      version: coin.version,
      digest: coin.digest,
    });
    total += Number(coin.balance);
    if (total >= amount) break;
  }

  if (total < amount) {
    const needed = amount / 1e6;
    const have = total / 1e6;
    throw new Error('Insufficient NUSDC balance. Need ' + needed + ' NUSDC, have ' + have + ' NUSDC.');
  }

  return selected;
}

export function useCreateRequest(): UseCreateRequestReturn {
  const { signer, address } = useSigner();

  const [status, setStatus] = useState<RequestStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  const createRequest = useCallback(async (prompt: string, model: ModelId, executor: ExecutorInfo) => {
    if (!address || !signer) {
      setError('Wallet not connected');
      return;
    }

    const modelConfig = MODEL_PRICING[model];
    if (!modelConfig) {
      setError('Invalid model selected');
      return;
    }

    if (!executor) {
      setError('No executor selected');
      return;
    }

    setStatus('creating');
    setError(null);
    setResult(null);

    try {
      // 1. Prepare request data
      const promptHash = await sha256(prompt);
      const promptHashBytes = hexToBytes(promptHash);
      const price = modelConfig.price;

      console.log('Creating request:', {
        model,
        price: price / 1e6,
        promptHash,
        executor: executor.name,
        executorAddress: executor.operator,
      });

      // 2. Get NUSDC coins for payment
      const client = new SuiClient({ url: NETWORK_CONFIG.rpcUrl });
      const coins = await getNusdcCoins(client, address, price);

      // 3. Build transaction
      const tx = new Transaction();

      // If multiple coins, merge them first
      if (coins.length > 1) {
        const [primary, ...rest] = coins;
        tx.mergeCoins(
          tx.object(primary.objectId),
          rest.map(c => tx.object(c.objectId))
        );
      }

      // Split exact amount for payment
      const [paymentCoin] = tx.splitCoins(
        tx.object(coins[0].objectId),
        [tx.pure.u64(price)]
      );

      // Call create_request with selected executor
      tx.moveCall({
        target: BLIND_CONFIG.packageId + '::blind::create_request',
        arguments: [
          tx.object(BLIND_CONFIG.registryId), // registry
          paymentCoin, // payment
          tx.pure.vector('u8', promptHashBytes), // prompt_hash
          tx.pure.string(model), // model
          tx.pure.address(executor.operator), // executor from registry
          tx.object('0x6'), // Clock
        ],
      });

      // 4. Sign and execute transaction
      if (!signer || !address) {
        throw new Error('Signer not available');
      }

      tx.setSender(address);
      const txBytes = await tx.build({ client });
      const { signature } = await signer.sign(txBytes);

      const txResult = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: {
          showEvents: true,
          showEffects: true,
        },
      });

      if (txResult.effects?.status?.status !== 'success') {
        throw new Error('Transaction failed: ' + (txResult.effects?.status?.error || 'Unknown error'));
      }

      console.log('Request created:', txResult.digest);

      // 5. Extract request ID from events
      const createEvent = txResult.events?.find(
        e => e.type.includes('::blind::RequestCreated')
      );

      if (!createEvent) {
        throw new Error('RequestCreated event not found');
      }

      const requestId = Number((createEvent.parsedJson as { request_id: string }).request_id);
      console.log('Request ID:', requestId);

      // 6. Call executor's backend to execute
      setStatus('executing');

      const encryptedPrompt = encodePrompt(prompt);
      const executorUrl = executor.endpointUrl || BLIND_CONFIG.backendUrl;

      console.log('Calling executor:', executorUrl);

      const executeResponse = await fetch(executorUrl + '/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          encryptedPrompt,
          model,
        }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json();
        throw new Error(errorData.error || 'Execution failed');
      }

      const executeResult = await executeResponse.json();

      if (!executeResult.success) {
        throw new Error(executeResult.error || 'Execution failed');
      }

      // 7. Set result
      setResult({
        requestId,
        result: executeResult.result,
        resultHash: executeResult.resultHash,
        txDigest: executeResult.txDigest,
        executionTimeMs: executeResult.executionTimeMs,
      });
      setStatus('completed');

      console.log('Request completed:', executeResult);
    } catch (err) {
      console.error('Request failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [signer, address]);

  return {
    status,
    error,
    result,
    createRequest,
    reset,
  };
}
