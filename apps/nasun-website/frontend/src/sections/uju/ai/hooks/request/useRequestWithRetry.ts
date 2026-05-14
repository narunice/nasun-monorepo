/**
 * Submit a chat prompt with weighted-random executor selection and retry on
 * failure (re-roll executor up to EXECUTOR_SELECTION.MAX_RETRIES times).
 *
 * Adapted from baram/features/request/hooks/useRequestWithRetry.ts. Drops the
 * baram tier gate (devnet has no staking yet) and runs against the per-agent
 * chatStore.
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useExecutors, selectExecutorWeightedRandom, type ExecutorInfo } from '../useExecutors';
import { useCreateRequest, type RequestResult } from './useCreateRequest';
import { useAttestation, type AttestationState } from './useAttestation';
import {
  EXECUTOR_SELECTION,
  MODEL_PRICING,
  type ModelId,
  type TierLevel,
} from '../../services/network';

function classifyError(rawError: string | null): string {
  if (!rawError) return 'Something went wrong. Please try again.';
  const lower = rawError.toLowerCase();
  if (lower.includes('insufficient') || lower.includes('not enough') || lower.includes('balance')) {
    return 'Insufficient NUSDC balance. Claim test tokens and try again.';
  }
  if (lower.includes('abort') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request timed out. The executor may be busy. Please try again in a moment.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'Network connection issue. Please check your connection and try again.';
  }
  if (lower.includes('refund')) return rawError;
  if (
    lower.includes('signer') ||
    lower.includes('wallet') ||
    lower.includes('rejected') ||
    lower.includes('denied')
  ) {
    return 'Transaction was not signed. Please approve the wallet prompt to continue.';
  }
  if (lower.includes('execution failed')) {
    return 'The AI executor encountered an error. Please try again.';
  }
  return `Request failed: ${rawError}`;
}

export interface UseRequestWithRetryReturn {
  submit: (prompt: string) => Promise<void>;
  isProcessing: boolean;
  error: string | null;
  selectedExecutor: ExecutorInfo | null;
  requestStatus: string;
  result: RequestResult | null;
  executorsLoading: boolean;
  executorsError: string | null;
  attestation: AttestationState & { refetch: () => Promise<void> };
}

export function useRequestWithRetry(): UseRequestWithRetryReturn {
  const { executors, isLoading: executorsLoading, error: executorsError } = useExecutors();
  const { status: requestStatus, error, result, createRequest, reset } = useCreateRequest();

  const selectedModel = useChatStore((state) => state.selectedModel);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const modelProvider = MODEL_PRICING[selectedModel]?.provider;
  const requiredMinTier: TierLevel = 0;
  const needsAttestation = modelProvider === 'tee';

  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorInfo | null>(null);
  const [failedExecutorIds, setFailedExecutorIds] = useState<Set<string>>(new Set());

  const assignedExecutor = useMemo(() => {
    if (executors.length === 0) return null;
    const pool = needsAttestation
      ? executors.filter((e) => e.teeType > 0)
      : executors.filter((e) => e.teeType === 0);
    return selectExecutorWeightedRandom(pool, failedExecutorIds, requiredMinTier, selectedModel);
  }, [executors, failedExecutorIds, requiredMinTier, selectedModel, needsAttestation]);

  useEffect(() => {
    if (!assignedExecutor) return;
    if (!selectedExecutor || selectedExecutor.id !== assignedExecutor.id) {
      setSelectedExecutor(assignedExecutor);
    }
  }, [assignedExecutor, selectedExecutor]);

  const attestation = useAttestation(
    needsAttestation ? selectedExecutor?.endpointUrl || null : null,
    needsAttestation ? selectedExecutor?.teeType || 0 : 0,
  );

  useEffect(() => {
    if (requestStatus === 'completed' && result) {
      addMessage({
        role: 'assistant',
        content: result.result,
        metadata: {
          requestId: result.requestId,
          executionTimeMs: result.executionTimeMs,
          teeVerified:
            (selectedExecutor?.teeType ?? 0) > 0 &&
            MODEL_PRICING[selectedModel]?.provider === 'tee',
          txDigest: result.txDigest,
          resultHash: result.resultHash,
          teeType: result.teeType,
          pcr0: result.pcr0,
          attestationVerified: result.attestationVerified,
        },
      });
      reset();
      setFailedExecutorIds(new Set());
      setSelectedExecutor(null);
    }
  }, [requestStatus, result, addMessage, reset, selectedExecutor, selectedModel]);

  const isProcessing =
    requestStatus === 'creating' ||
    requestStatus === 'executing' ||
    requestStatus === 'cancelling';

  const submit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isProcessing || !selectedExecutor) return;

      const previousMessages = [...useChatStore.getState().messages];

      const userMessageId = addMessage({ role: 'user', content: prompt });

      const { MAX_RETRIES } = EXECUTOR_SELECTION;
      let currentExecutor: ExecutorInfo | null = selectedExecutor;
      const excluded = new Set<string>();
      let lastError: string | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (!currentExecutor) break;
        try {
          await createRequest(prompt.trim(), selectedModel as ModelId, currentExecutor, {
            previousMessages,
          });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Unknown error';
          console.warn(
            `[RequestWithRetry] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`,
            lastError,
          );
          excluded.add(currentExecutor.id);
          const retryPool = needsAttestation
            ? executors.filter((e) => e.teeType > 0)
            : executors.filter((e) => e.teeType === 0);
          currentExecutor = selectExecutorWeightedRandom(
            retryPool,
            excluded,
            requiredMinTier,
            selectedModel,
          );
          if (currentExecutor) setSelectedExecutor(currentExecutor);
        }
      }

      updateMessage(userMessageId, { failed: true });
      addMessage({ role: 'assistant', content: classifyError(lastError), failed: true });
      setFailedExecutorIds(excluded);
    },
    [
      isProcessing,
      selectedExecutor,
      selectedModel,
      createRequest,
      addMessage,
      executors,
      requiredMinTier,
      updateMessage,
      needsAttestation,
    ],
  );

  return {
    submit,
    isProcessing,
    error,
    selectedExecutor,
    requestStatus,
    result,
    executorsLoading,
    executorsError,
    attestation,
  };
}
