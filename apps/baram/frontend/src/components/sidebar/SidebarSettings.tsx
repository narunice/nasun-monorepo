/**
 * SidebarSettings - Model and Executor selection in sidebar
 * Shows detailed executor info (reputation, completion rate, TEE type)
 */

import { useChatStore } from '../../stores/chatStore';
import { useExecutors, ExecutorInfo } from '../../features/request/hooks/useExecutors';
import { MODEL_PRICING, ModelId } from '../../config/network';

// Calculate success rate percentage
function getSuccessRate(executor: ExecutorInfo): number {
  const total = executor.completedJobs + executor.failedJobs;
  if (total === 0) return 100;
  return Math.round((executor.completedJobs / total) * 100);
}

// Get reputation color class
function getReputationColor(reputation: number): string {
  if (reputation >= 800) return 'text-[var(--color-success)]';
  if (reputation >= 500) return 'text-yellow-500';
  return 'text-[var(--color-error)]';
}

// Format price for display
function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  return `${(price / 1e6).toFixed(2)} NUSDC`;
}

export function SidebarSettings() {
  const { executors } = useExecutors();

  const selectedExecutorId = useChatStore((state) => state.selectedExecutorId);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedExecutor = useChatStore((state) => state.setSelectedExecutor);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const clearAllSessions = useChatStore((state) => state.clearAllSessions);

  const selectedExecutor = executors.find((e) => e.id === selectedExecutorId) || null;

  const handleExecutorChange = (executorId: string) => {
    setSelectedExecutor(executorId || null);
  };

  const handleClearAll = async () => {
    if (window.confirm('Delete all chat history? This cannot be undone.')) {
      await clearAllSessions();
    }
  };

  const allModels = Object.keys(MODEL_PRICING) as ModelId[];
  const selectedModelConfig = selectedModel ? MODEL_PRICING[selectedModel as ModelId] : null;

  return (
    <div className="p-3 space-y-3">
      {/* Model Selection with Price */}
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
          Model
        </label>
        <select
          value={selectedModel || ''}
          onChange={(e) => setSelectedModel(e.target.value || null)}
          className="w-full px-2 py-1.5 text-sm rounded-md
                     bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]
                     text-[var(--color-text-primary)]
                     focus:outline-none focus:ring-1 focus:ring-baram-1"
        >
          <option key="_model_placeholder" value="">Select model...</option>
          {allModels.map((modelId) => {
            const config = MODEL_PRICING[modelId];
            return (
              <option key={modelId} value={modelId}>
                {config.name} ({formatPrice(config.price)})
              </option>
            );
          })}
        </select>
        {selectedModelConfig && (
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">
            {selectedModelConfig.description}
          </div>
        )}
      </div>

      {/* Executor Selection with Details */}
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
          Executor
        </label>
        <select
          value={selectedExecutorId || ''}
          onChange={(e) => handleExecutorChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md
                     bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]
                     text-[var(--color-text-primary)]
                     focus:outline-none focus:ring-1 focus:ring-baram-1"
        >
          <option key="_executor_placeholder" value="">Select executor...</option>
          {executors.map((executor, index) => {
            const successRate = getSuccessRate(executor);
            return (
              <option key={executor.id || `executor-${index}`} value={executor.id}>
                {executor.name} | {executor.reputation} rep | {successRate}%
              </option>
            );
          })}
        </select>
      </div>

      {/* Selected Executor Info Panel */}
      {selectedExecutor && (
        <div className="p-2 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text-primary)]">
              {selectedExecutor.name}
            </span>
            {selectedExecutor.teeType > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-baram-1/20 text-baram-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {selectedExecutor.teeTypeName}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-[var(--color-text-muted)]">Reputation</span>
              <div className={`font-medium ${getReputationColor(selectedExecutor.reputation)}`}>
                {selectedExecutor.reputation}/1000
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Success Rate</span>
              <div className="font-medium text-[var(--color-text-primary)]">
                {getSuccessRate(selectedExecutor)}% ({selectedExecutor.completedJobs} jobs)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Button */}
      <button
        onClick={handleClearAll}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                   text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]
                   hover:bg-[var(--color-error)]/10 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>Clear All History</span>
      </button>
    </div>
  );
}
