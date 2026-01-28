/**
 * RequestForm - AI computation request form with executor selection
 */

import { useState, useEffect } from 'react';
import { useCreateRequest } from '../hooks/useCreateRequest';
import { useExecutors, ExecutorInfo } from '../hooks/useExecutors';
import { useAttestation } from '../hooks/useAttestation';
import { MODEL_PRICING, ModelId, DEFAULT_MODEL, BARAM_CONFIG } from '@/config/network';
import { ResultDisplay } from './ResultDisplay';
import { ExecutorSelector } from './ExecutorSelector';
import { AttestationDisplay } from './AttestationDisplay';
import { StatusIndicator } from './StatusIndicator';
import { ModelSelector } from './ModelSelector';

export function RequestForm() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorInfo | null>(null);
  const [showExecutorSelector, setShowExecutorSelector] = useState(false);

  const { executors } = useExecutors();
  const { status, error, result, createRequest, reset } = useCreateRequest();

  // Fetch attestation when executor is selected
  const attestation = useAttestation(
    selectedExecutor?.endpointUrl || null,
    selectedExecutor?.teeType || 0
  );

  // Auto-select first executor if none selected
  useEffect(() => {
    if (!selectedExecutor && executors.length > 0) {
      // Try to find the default executor from config, otherwise use first
      const defaultExecutor = executors.find(e => e.operator === BARAM_CONFIG.executorAddress);
      setSelectedExecutor(defaultExecutor || executors[0]);
    }
  }, [executors, selectedExecutor]);

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
  };

  const handleExecutorSelect = (executor: ExecutorInfo) => {
    setSelectedExecutor(executor);
    setShowExecutorSelector(false);
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
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-baram-1 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* Model Selection */}
          <ModelSelector
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            disabled={isProcessing}
          />

          {/* Executor Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Executor
            </label>

            {showExecutorSelector ? (
              <div className="space-y-2">
                <ExecutorSelector
                  selectedExecutor={selectedExecutor?.operator || null}
                  onSelect={handleExecutorSelect}
                  disabled={isProcessing}
                />
                <button
                  type="button"
                  onClick={() => setShowExecutorSelector(false)}
                  className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowExecutorSelector(true)}
                disabled={isProcessing}
                className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-left hover:border-[var(--color-text-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {selectedExecutor ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[var(--color-text-primary)]">
                        {selectedExecutor.name}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {selectedExecutor.teeTypeName} | Reputation: {selectedExecutor.reputation}/1000
                      </div>
                    </div>
                    <span className="text-sm text-baram-1">Change</span>
                  </div>
                ) : (
                  <div className="text-[var(--color-text-muted)]">
                    Select an executor...
                  </div>
                )}
              </button>
            )}
          </div>

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
                className="px-6 py-2 bg-baram-1 hover:bg-baram-2 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
      {result && <ResultDisplay result={result} />}
    </div>
  );
}
