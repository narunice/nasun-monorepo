/**
 * useCreateRequest - Hook for creating AI computation requests
 *
 * Supports conversation context for multi-turn conversations.
 * Previous messages are included in the encrypted payload sent to TEE.
 */

import { useState, useCallback } from 'react';
import { useSigner } from '@nasun/wallet';
import { BARAM_CONFIG, MODEL_PRICING, ModelId } from '@/config/network';
import { suiClient } from '@/config/client';
import type { ExecutorInfo } from './useExecutors';
import { sha256, hexToBytes, encodePrompt } from '@/utils/encoding';
import { encryptPromptForTEE, decryptResponseFromTEE } from '@/utils/tee';
import { getNusdcCoins } from '../services/coinService';
import { buildCreateRequestTransaction, buildCancelRequestTransaction } from '../services/transactionBuilder';
import { buildContextWithPrompt, formatContextForTee } from '@/services/contextBuilder';
import type { Message } from '@/types/chat';

export type RequestStatus = 'idle' | 'creating' | 'executing' | 'cancelling' | 'completed' | 'error';

export interface RequestResult {
  requestId: number;
  result: string;
  resultHash: string;
  txDigest: string;
  executionTimeMs: number;
  // TEE attestation data (from executor response)
  teeType?: number;
  pcr0?: string;
  attestationVerified?: boolean;
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
      } else {
        textToSend = prompt;
      }

      // 2. Prepare request data (hash is based on full context)
      const promptHash = await sha256(textToSend);
      const promptHashBytes = hexToBytes(promptHash);
      const price = modelConfig.price;

      // 3. Get NUSDC coins for payment
      const client = suiClient;
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

      // 5. Extract request ID from events
      const createEvent = txResult.events?.find(
        e => e.type.includes('::baram::RequestCreated')
      );

      if (!createEvent) {
        throw new Error('RequestCreated event not found');
      }

      const requestId = Number((createEvent.parsedJson as { request_id: string }).request_id);

      // 6. Call executor's backend to execute
      setStatus('executing');

      const executorUrl = executor.endpointUrl || BARAM_CONFIG.backendUrl;

      // TEE executors: RSA-OAEP + AES-256-GCM E2E encryption
      // Cloud executors: Base64 encoding only (no TEE encryption)
      const needsTeeEncryption = executor.teeType > 0;
      const promptPayload = needsTeeEncryption
        ? await encryptPromptForTEE(textToSend, executorUrl, requestId)
        : encodePrompt(textToSend);

      let executeResult;
      try {
        // 60s timeout — prevents indefinite hang if executor is unresponsive
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        let executeResponse: Response;
        try {
          // Only send API key to our Lambda backend — never leak to third-party executors
          const isLambdaBackend = executorUrl === BARAM_CONFIG.backendUrl;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (isLambdaBackend && BARAM_CONFIG.apiKey) {
            headers['x-api-key'] = BARAM_CONFIG.apiKey;
          }

          executeResponse = await fetch(executorUrl + '/execute', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              requestId,
              encryptedPrompt: promptPayload,
              model,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json();
          // Sanitize executor error message: truncate and strip URLs to prevent phishing
          const rawError = String(errorData.error || 'Execution failed');
          const safeError = rawError.slice(0, 200).replace(/https?:\/\/\S+/g, '[URL removed]');
          throw new Error(safeError);
        }

        executeResult = await executeResponse.json();

        if (!executeResult.success) {
          throw new Error(executeResult.error || 'Execution failed');
        }
      } catch (executeError) {
        // Execution failed — auto-cancel to release escrow immediately
        console.warn(`[useCreateRequest] Execution failed, auto-cancelling request #${requestId}`);
        setStatus('cancelling');

        let cancelSucceeded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const cancelTx = buildCancelRequestTransaction(requestId);
            cancelTx.setSender(address);
            const cancelTxBytes = await cancelTx.build({ client });
            const { signature: cancelSig } = await signer.sign(cancelTxBytes);
            await client.executeTransactionBlock({
              transactionBlock: cancelTxBytes,
              signature: cancelSig,
            });
            cancelSucceeded = true;
            break;
          } catch (cancelError) {
            console.warn(`[useCreateRequest] Cancel attempt ${attempt}/2 failed:`, cancelError);
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
          }
        }

        if (!cancelSucceeded) {
          throw new Error(
            `Execution failed and auto-refund failed. Your NUSDC is locked in request #${requestId}. ` +
            `Timeout refund available in ~5 minutes.`
          );
        }

        throw executeError;
      }

      // 7. Decrypt E2E-encrypted response if applicable
      let resultText = executeResult.result;
      if (executeResult.encrypted) {
        resultText = await decryptResponseFromTEE(executeResult.result, requestId);
      }

      // 8. Set result (include TEE attestation data if available)
      setResult({
        requestId,
        result: resultText,
        resultHash: executeResult.resultHash,
        txDigest: executeResult.txDigest,
        executionTimeMs: executeResult.executionTimeMs,
        teeType: executor.teeType > 0 ? executor.teeType : undefined,
        pcr0: executeResult.attestation?.pcrs?.pcr0,
        attestationVerified: executeResult.attestationVerification?.valid,
      });
      setStatus('completed');
    } catch (err) {
      console.error('Request failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
      // Re-throw so callers (e.g., App.tsx retry loop) can catch and re-roll
      throw err;
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
