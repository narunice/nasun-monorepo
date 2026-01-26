/**
 * RequestForm - AI computation request form
 */

import { useState } from 'react';
import { useCreateRequest, RequestStatus } from '../hooks/useCreateRequest';
import { MODEL_PRICING, ModelId, DEFAULT_MODEL } from '@/config/network';
import { ResultDisplay } from './ResultDisplay';

const models = Object.entries(MODEL_PRICING).map(([id, config]) => ({
  id: id as ModelId,
  ...config,
}));

function StatusIndicator({ status }: { status: RequestStatus }) {
  if (status === 'idle') return null;

  const statusConfig = {
    creating: {
      text: 'Creating request...',
      color: 'text-blind-1',
      animate: true,
    },
    executing: {
      text: 'AI processing...',
      color: 'text-blind-2',
      animate: true,
    },
    completed: {
      text: 'Completed',
      color: 'text-[var(--color-success)]',
      animate: false,
    },
    error: {
      text: 'Failed',
      color: 'text-[var(--color-error)]',
      animate: false,
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 ${config.color}`}>
      {config.animate && (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
}

export function RequestForm() {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const { status, error, result, createRequest, reset } = useCreateRequest();

  const isProcessing = status === 'creating' || status === 'executing';
  const selectedModelConfig = MODEL_PRICING[selectedModel];
  const priceDisplay = (selectedModelConfig.price / 1e6).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing) return;
    await createRequest(prompt.trim(), selectedModel);
  };

  const handleReset = () => {
    reset();
    setPrompt('');
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
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blind-1 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Model
            </label>
            <div className="grid grid-cols-2 gap-3">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedModel(model.id)}
                  disabled={isProcessing}
                  className={`p-3 rounded-md border text-left transition-all ${
                    selectedModel === model.id
                      ? 'border-blind-1 bg-blind-1/10'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:border-[var(--color-text-muted)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {model.name}
                    </span>
                    <span className="text-sm text-blind-1">
                      {(model.price / 1e6).toFixed(2)} NUSDC
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {model.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

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
                disabled={!prompt.trim() || isProcessing}
                className="px-6 py-2 bg-blind-1 hover:bg-blind-2 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  'Processing...'
                ) : (
                  <>
                    <span>Pay {priceDisplay} NUSDC</span>
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
