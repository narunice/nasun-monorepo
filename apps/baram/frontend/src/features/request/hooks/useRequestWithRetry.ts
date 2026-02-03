/**
 * useRequestWithRetry - Executor auto-assignment + submit with retry on failure
 *
 * Encapsulates weighted random executor selection, TEE/tier filtering,
 * retry loop with executor re-roll, and result completion handling.
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useCreateRequest } from './useCreateRequest';
import { useExecutors, selectExecutorWeightedRandom, type ExecutorInfo } from './useExecutors';
import { useAttestation } from './useAttestation';
import { useChatStore } from '@/stores/chatStore';
import { ModelId, EXECUTOR_SELECTION, MODEL_PRICING, type TierLevel } from '@/config/network';
import type { RequestResult } from './useCreateRequest';
import type { AttestationState } from './useAttestation';

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

  // Model provider determines executor tier requirement
  const modelProvider = MODEL_PRICING[selectedModel as ModelId]?.provider;
  const requiredMinTier: TierLevel = modelProvider === 'tee' ? 1 : 0;
  const needsAttestation = modelProvider === 'tee';

  // Auto-assign executor via weighted random
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorInfo | null>(null);
  const [failedExecutorIds, setFailedExecutorIds] = useState<Set<string>>(new Set());

  const assignedExecutor = useMemo(() => {
    if (executors.length === 0) return null;
    const pool = needsAttestation ? executors.filter(e => e.teeType > 0) : executors;
    return selectExecutorWeightedRandom(pool, failedExecutorIds, requiredMinTier, selectedModel ?? undefined);
  }, [executors, failedExecutorIds, requiredMinTier, selectedModel, needsAttestation]);

  useEffect(() => {
    if (!assignedExecutor) return;
    if (!selectedExecutor || selectedExecutor.id !== assignedExecutor.id) {
      setSelectedExecutor(assignedExecutor);
    }
  }, [assignedExecutor, selectedExecutor]);

  // Attestation: only fetch for TEE local models
  const attestation = useAttestation(
    needsAttestation ? (selectedExecutor?.endpointUrl || null) : null,
    needsAttestation ? (selectedExecutor?.teeType || 0) : 0
  );

  // Handle result when completed
  useEffect(() => {
    if (requestStatus === 'completed' && result) {
      addMessage({
        role: 'assistant',
        content: result.result,
        metadata: {
          requestId: result.requestId,
          executionTimeMs: result.executionTimeMs,
          teeVerified: (selectedExecutor?.teeType ?? 0) > 0 && MODEL_PRICING[selectedModel as ModelId]?.provider === 'tee',
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

  const isProcessing = requestStatus === 'creating' || requestStatus === 'executing';

  const submit = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isProcessing || !selectedExecutor) return;

    // B-1: Read messages from store to avoid stale closure
    const previousMessages = [...useChatStore.getState().messages];

    const userMessageId = addMessage({
      role: 'user',
      content: prompt,
    });

    const { MAX_RETRIES } = EXECUTOR_SELECTION;
    let currentExecutor: ExecutorInfo | null = selectedExecutor;
    const excluded = new Set<string>();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (!currentExecutor) break;

      try {
        await createRequest(prompt.trim(), selectedModel as ModelId, currentExecutor, {
          previousMessages,
        });
        return; // Success
      } catch {
        excluded.add(currentExecutor.id);
        currentExecutor = selectExecutorWeightedRandom(executors, excluded, requiredMinTier, selectedModel ?? undefined);
        if (currentExecutor) {
          setSelectedExecutor(currentExecutor);
        }
      }
    }

    // All retries exhausted
    updateMessage(userMessageId, { failed: true });
    setFailedExecutorIds(excluded);
  }, [isProcessing, selectedExecutor, selectedModel, createRequest, addMessage, executors, requiredMinTier, updateMessage]);

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
