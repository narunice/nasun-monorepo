/**
 * SidebarSettings - Model selection and clear history
 * Executor is auto-assigned (no manual selection).
 */

import { useChatStore } from '../../stores/chatStore';
import { MODEL_PRICING, ModelId } from '../../config/network';

// Format price for display
function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  return `${(price / 1e6).toFixed(2)} NUSDC`;
}

export function SidebarSettings() {
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const clearAllSessions = useChatStore((state) => state.clearAllSessions);

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
