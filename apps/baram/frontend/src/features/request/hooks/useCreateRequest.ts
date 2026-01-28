/**
 * useCreateRequest - Hook for creating AI computation requests
 *
 * Supports conversation context for multi-turn conversations.
 * Previous messages are included in the encrypted payload sent to TEE.
 */

import { useState, useCallback } from 'react';
import { useSigner } from '@nasun/wallet';
import { SuiClient } from '@mysten/sui/client';
import { BARAM_CONFIG, NETWORK_CONFIG, MODEL_PRICING, ModelId } from '@/config/network';
import type { ExecutorInfo } from './useExecutors';
import { sha256, hexToBytes, encodePrompt } from '@/utils/encoding';
import { encryptPromptForTEE } from '@/utils/tee';
import { getNusdcCoins } from '../services/coinService';
import { buildCreateRequestTransaction } from '../services/transactionBuilder';
import { buildContextWithPrompt, formatContextForTee } from '@/services/contextBuilder';
import type { Message } from '@/types/chat';

export type RequestStatus = 'idle' | 'creating' | 'executing' | 'completed' | 'error';

export interface RequestResult {
  requestId: number;
  result: string;
  resultHash: string;
  txDigest: string;
  executionTimeMs: number;
}

export interface CreateRequestOptions {
  previousMessages?: Message[];
}

export interface UseCreateRequestReturn {
  status: RequestStatus;
  error: string | null;
  result: RequestResult | null;
  createRequest: (prompt: string, model: ModelId, executor: ExecutorInfo, options?: CreateRequestOptions) => Promise<void>;
  reset: () => void;
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

  const createRequest = useCallback(async (
    prompt: string,
    model: ModelId,
    executor: ExecutorInfo,
    options: CreateRequestOptions = {}
  ) => {
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
      // 1. Build context first to calculate hash correctly
      const { previousMessages } = options;
      let textToSend: string;

      if (previousMessages && previousMessages.length > 0) {
        // Build context with previous messages
        const context = buildContextWithPrompt(previousMessages, prompt);
        textToSend = formatContextForTee(context);
        console.log('Built context with', context.messages.length, 'messages');
      } else {
        textToSend = prompt;
      }

      // 2. Prepare request data (hash is based on full context)
      const promptHash = await sha256(textToSend);
      const promptHashBytes = hexToBytes(promptHash);
      const price = modelConfig.price;

      console.log('Creating request:', {
        model,
        price: price / 1e6,
        promptHash,
        executor: executor.name,
        executorAddress: executor.operator,
      });

      // 3. Get NUSDC coins for payment
      const client = new SuiClient({ url: NETWORK_CONFIG.rpcUrl });
      const coins = await getNusdcCoins(client, address, price);

      // 3. Build transaction
      const tx = buildCreateRequestTransaction({
        coins,
        promptHashBytes,
        model,
        executorOperator: executor.operator,
        price,
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
        e => e.type.includes('::baram::RequestCreated')
      );

      if (!createEvent) {
        throw new Error('RequestCreated event not found');
      }

      const requestId = Number((createEvent.parsedJson as { request_id: string }).request_id);
      console.log('Request ID:', requestId);

      // 6. Call executor's backend to execute
      setStatus('executing');

      const executorUrl = executor.endpointUrl || BARAM_CONFIG.backendUrl;

      // Use RSA-OAEP encryption for TEE executors, Base64 for others
      const isTeeExecutor = executor.teeType > 0;
      const encryptedPrompt = isTeeExecutor
        ? await encryptPromptForTEE(textToSend, executorUrl)
        : encodePrompt(textToSend);

      console.log('Calling executor:', executorUrl, isTeeExecutor ? '(TEE)' : '(non-TEE)');

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
