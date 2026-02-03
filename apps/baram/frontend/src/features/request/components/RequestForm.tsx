/**
 * RequestForm - AI computation request form with automatic executor assignment
 */

import { useState, useEffect, useMemo } from 'react';
import { useCreateRequest } from '../hooks/useCreateRequest';
import { useExecutors, ExecutorInfo, selectExecutorWeightedRandom } from '../hooks/useExecutors';
import { useAttestation } from '../hooks/useAttestation';
import { MODEL_PRICING, ModelId, DEFAULT_MODEL } from '@/config/network';
import { ResultDisplay } from './ResultDisplay';
import { AttestationDisplay } from './AttestationDisplay';
import { StatusIndicator } from './StatusIndicator';
import { ModelSelector } from './ModelSelector';
import { TierBadge } from '@/components/badges/TierBadge';

export function RequestForm() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorInfo | null>(null);

  const { executors } = useExecutors();
  const { status, error, result, createRequest, reset } = useCreateRequest();

  // Fetch attestation when executor is selected
  const attestation = useAttestation(
    selectedExecutor?.endpointUrl || null,
    selectedExecutor?.teeType || 0
  );

  // Auto-assign executor via weighted random when executors are available
  const assignedExecutor = useMemo(() => {
    if (executors.length === 0) return null;
    return selectExecutorWeightedRandom(executors, new Set(), undefined, selectedModel);
  }, [executors, selectedModel]);

  useEffect(() => {
    if (assignedExecutor && !selectedExecutor) {
      setSelectedExecutor(assignedExecutor);
    }
  }, [assignedExecutor, selectedExecutor]);

  const isProcessing = status === 'creating' || status === 'executing';
  const selectedModelConfig = MODEL_PRICING[selectedModel];
  const isFreeModel = selectedModelConfig.price === 0;
  const priceDisplay = isFreeModel ? 'Free' : `${(selectedModelConfig.price / 1e6).toFixed(2)} NUSDC`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing || !selectedExecutor) return;
    await createRequest(prompt.trim(), selectedModel, selectedExecutor);
  };

  const handleReset = () => {
    reset();
    setPrompt('');
    // Re-roll executor for the next request
    const newExecutor = selectExecutorWeightedRandom(executors, new Set(), undefined, selectedModel);
    if (newExecutor) setSelectedExecutor(newExecutor);
  };

  return (
    <div className="space-y-4">
      {/* Request Form */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          New Request
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Prompt Input */}
          <div>
            <label
              htmlFor="prompt"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              rows={4}
              disabled={isProcessing}
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-br-1 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* Model Selection */}
          <ModelSelector
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            disabled={isProcessing}
          />

          {/* Assigned Executor (read-only) */}
          {selectedExecutor && (
            <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {selectedExecutor.name}
                </span>
                <TierBadge tier={selectedExecutor.tier} tierName={selectedExecutor.tierName} />
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {selectedExecutor.teeTypeName}
              </div>
            </div>
          )}

          {/* Attestation Info */}
          {selectedExecutor && (
            <AttestationDisplay
              teeType={selectedExecutor.teeType}
              attestation={attestation}
            />
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-between pt-2">
            <StatusIndicator status={status} />

            <div className="flex items-center gap-3">
              {(status === 'completed' || status === 'error') && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  New Request
                </button>
              )}

              <button
                type="submit"
                disabled={!prompt.trim() || isProcessing || !selectedExecutor}
                className="px-6 py-2 bg-br-1d hover:bg-br-2d text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  'Processing...'
                ) : (
                  <>
                    <span>{isFreeModel ? 'Submit (Free)' : `Pay ${priceDisplay}`}</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded-md">
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          </div>
        )}
      </div>

      {/* Result Display */}
      {result && <ResultDisplay result={result} executor={selectedExecutor} />}
    </div>
  );
}
