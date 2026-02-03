/**
 * ModelSelector - AI model selection component
 */

import { MODEL_PRICING, ModelId } from '@/config/network';

interface ModelSelectorProps {
  selectedModel: ModelId;
  onSelect: (model: ModelId) => void;
  disabled?: boolean;
}

const models = Object.entries(MODEL_PRICING).map(([id, config]) => ({
  id: id as ModelId,
  ...config,
}));

export function ModelSelector({ selectedModel, onSelect, disabled }: ModelSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
        Model
      </label>
      <div className="grid grid-cols-2 gap-3">
        {models.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => onSelect(model.id)}
            disabled={disabled}
            className={`p-3 rounded-md border text-left transition-all ${
              selectedModel === model.id
                ? 'border-br-1d bg-br-1/10'
                : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:border-[var(--color-text-muted)]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-[var(--color-text-primary)]">
                {model.name}
              </span>
              <span className={`text-sm ${model.price === 0 ? 'text-green-500' : 'text-br-1'}`}>
                {model.price === 0 ? 'Free' : `${(model.price / 1e6).toFixed(2)} NUSDC`}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {model.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
