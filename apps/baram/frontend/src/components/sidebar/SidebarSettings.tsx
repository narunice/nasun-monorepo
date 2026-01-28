/**
 * SidebarSettings - Executor and Model selection in sidebar
 */

import { useChatStore } from '../../stores/chatStore';
import { useExecutors, ExecutorInfo } from '../../features/request/hooks/useExecutors';
import { MODEL_PRICING, ModelId } from '../../config/network';

export function SidebarSettings() {
  const { executors } = useExecutors();

  const selectedExecutorId = useChatStore((state) => state.selectedExecutorId);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedExecutor = useChatStore((state) => state.setSelectedExecutor);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const clearAllSessions = useChatStore((state) => state.clearAllSessions);

  const selectedExecutor = executors.find((e) => e.id === selectedExecutorId) || null;

  // Get models available for selected executor
  const availableModels = selectedExecutor
    ? selectedExecutor.supportedModels.filter((m) => m in MODEL_PRICING)
    : Object.keys(MODEL_PRICING);

  const handleExecutorChange = (executorId: string) => {
    setSelectedExecutor(executorId || null);
    // Reset model if not supported by new executor
    const executor = executors.find((e) => e.id === executorId);
    if (executor && selectedModel && !executor.supportedModels.includes(selectedModel)) {
      setSelectedModel(executor.supportedModels[0] || null);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Delete all chat history? This cannot be undone.')) {
      await clearAllSessions();
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Executor Selection */}
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
          <option key="_placeholder" value="">Select executor...</option>
          {executors.map((executor) => (
            <option key={executor.id} value={executor.id}>
              {executor.name}
              {executor.teeType > 0 ? ' (TEE)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Model Selection */}
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
          Model
        </label>
        <select
          value={selectedModel || ''}
          onChange={(e) => setSelectedModel(e.target.value || null)}
          disabled={!selectedExecutorId}
          className="w-full px-2 py-1.5 text-sm rounded-md
                     bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]
                     text-[var(--color-text-primary)]
                     focus:outline-none focus:ring-1 focus:ring-baram-1
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option key="_placeholder" value="">Select model...</option>
          {availableModels.map((modelId) => (
            <option key={modelId} value={modelId}>
              {MODEL_PRICING[modelId as ModelId]?.name || modelId}
            </option>
          ))}
        </select>
      </div>

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
