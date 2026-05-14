/**
 * Submit one AI computation request: pay NUSDC, dispatch to executor, decrypt
 * (TEE) or receive (cloud) the response, auto-cancel on failure.
 *
 * Ported from baram/features/request/hooks/useCreateRequest.ts. Adapted to use
 * the nasun-website service modules (uju/ai/services/{coinService,
 * transactionBuilder, network}) and `@/lib/sui-client`.
 */

import { useState, useCallback } from 'react';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/lib/sui-client';
import { BARAM_CONFIG, MODEL_PRICING, type ModelId } from '../../services/network';
import { getNusdcCoins } from '../../services/coinService';
import {
  buildCreateRequestTransaction,
  buildCancelRequestTransaction,
} from '../../services/transactionBuilder';
import { sha256, hexToBytes, encodePrompt } from '../../utils/encoding';
import { encryptPromptForTEE, decryptResponseFromTEE } from '../../utils/tee';
import { buildContextWithPrompt, formatContextForTee } from '../../services/contextBuilder';
import type { Message } from '../../types/chat';
import type { ExecutorInfo } from '../useExecutors';

export type RequestStatus =
  | 'idle'
  | 'creating'
  | 'executing'
  | 'cancelling'
  | 'completed'
  | 'error';

export interface RequestResult {
  requestId: number;
  result: string;
  resultHash: string;
  txDigest: string;
  executionTimeMs: number;
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
  createRequest: (
    prompt: string,
    model: ModelId,
    executor: ExecutorInfo,
    options?: CreateRequestOptions,
  ) => Promise<void>;
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

  const createRequest = useCallback(
    async (
      prompt: string,
      model: ModelId,
      executor: ExecutorInfo,
      options: CreateRequestOptions = {},
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
        const { previousMessages } = options;
        const textToSend =
          previousMessages && previousMessages.length > 0
            ? formatContextForTee(buildContextWithPrompt(previousMessages, prompt))
            : prompt;

        const promptHash = await sha256(textToSend);
        const promptHashBytes = hexToBytes(promptHash);
        const price = modelConfig.price;

        const coins = await getNusdcCoins(suiClient, address, price);

        const tx = buildCreateRequestTransaction({
          coins,
          promptHashBytes,
          model,
          executorOperator: executor.operator,
          price,
        });

        tx.setSender(address);
        const txBytes = await tx.build({ client: suiClient });
        const { signature } = await signer.sign(txBytes);

        const txResult = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEvents: true, showEffects: true },
        });

        if (txResult.effects?.status?.status !== 'success') {
          throw new Error(
            'Transaction failed: ' + (txResult.effects?.status?.error || 'Unknown error'),
          );
        }

        const createEvent = txResult.events?.find((e) =>
          e.type.includes('::baram::RequestCreated'),
        );
        if (!createEvent) throw new Error('RequestCreated event not found');
        const requestId = Number(
          (createEvent.parsedJson as { request_id: string }).request_id,
        );

        setStatus('executing');

        const isTeeModel = modelConfig.provider === 'tee';
        const executorUrl = isTeeModel
          ? executor.endpointUrl || BARAM_CONFIG.backendUrl
          : BARAM_CONFIG.backendUrl;
        const needsTeeEncryption = isTeeModel && executor.teeType > 0;
        const promptPayload = needsTeeEncryption
          ? await encryptPromptForTEE(textToSend, executorUrl, requestId)
          : encodePrompt(textToSend);

        let executeResult;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 60_000);

          let executeResponse: Response;
          try {
            const isLambdaBackend = executorUrl === BARAM_CONFIG.backendUrl;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isLambdaBackend && BARAM_CONFIG.apiKey) {
              headers['x-api-key'] = BARAM_CONFIG.apiKey;
            }
            executeResponse = await fetch(executorUrl + '/execute', {
              method: 'POST',
              headers,
              body: JSON.stringify({ requestId, encryptedPrompt: promptPayload, model }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }

          if (!executeResponse.ok) {
            const errorData = await executeResponse.json();
            const rawError = String(errorData.error || 'Execution failed');
            const safe = rawError.slice(0, 200).replace(/https?:\/\/\S+/g, '[URL removed]');
            throw new Error(safe);
          }

          executeResult = await executeResponse.json();

          if (!executeResult.success) {
            const rawErr = String(executeResult.error || 'Execution failed');
            const safe = rawErr.slice(0, 200).replace(/https?:\/\/\S+/g, '[URL removed]');
            throw new Error(safe);
          }
        } catch (executeError) {
          // Auto-cancel to release escrow.
          console.warn(`[useCreateRequest] Execution failed, auto-cancelling #${requestId}`);
          setStatus('cancelling');

          let cancelOk = false;
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const cancelTx = buildCancelRequestTransaction(requestId);
              cancelTx.setSender(address);
              const cancelBytes = await cancelTx.build({ client: suiClient });
              const { signature: cancelSig } = await signer.sign(cancelBytes);
              await suiClient.executeTransactionBlock({
                transactionBlock: cancelBytes,
                signature: cancelSig,
              });
              cancelOk = true;
              break;
            } catch (cancelError) {
              console.warn(`[useCreateRequest] Cancel ${attempt}/2 failed:`, cancelError);
              if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
            }
          }

          if (!cancelOk) {
            throw new Error(
              'Payment is being automatically refunded. Usually takes about 5 minutes. No action needed.',
            );
          }
          throw executeError;
        }

        let resultText = executeResult.result;
        if (executeResult.encrypted) {
          resultText = await decryptResponseFromTEE(executeResult.result, requestId);
        }

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
        throw err;
      }
    },
    [signer, address],
  );

  return { status, error, result, createRequest, reset };
}
