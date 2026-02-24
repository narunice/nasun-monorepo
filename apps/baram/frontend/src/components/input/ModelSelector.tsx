/**
 * ModelSelector - Custom dropdown for AI model selection
 *
 * Displays a pill trigger with the current model name. Opens an upward-floating
 * panel with models grouped by category (Cloud / Private / Fast).
 * Filters available models based on privacy mode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MODEL_PRICING,
  MODEL_CATEGORY_LABELS,
  MODEL_CATEGORY_ORDER,
  PRIVACY_MODE_CONFIG,
  type ModelId,
} from '../../config/network';

interface ModelSelectorProps {
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  privacyMode: boolean;
}

export function ModelSelector({ selectedModel, onSelectModel, privacyMode }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const config = privacyMode ? PRIVACY_MODE_CONFIG.private : PRIVACY_MODE_CONFIG.standard;
  const allowedProviders = config.allowedProviders as readonly string[];

  // Filter models by privacy mode
  const allowedModels = Object.entries(MODEL_PRICING).filter(
    ([, model]) => allowedProviders.includes(model.provider)
  );

  // Group by category
  const groupedModels = MODEL_CATEGORY_ORDER
    .map((category) => ({
      category,
      label: MODEL_CATEGORY_LABELS[category],
      models: allowedModels.filter(([, m]) => m.category === category),
    }))
    .filter((group) => group.models.length > 0);

  const currentModel = selectedModel ? MODEL_PRICING[selectedModel as ModelId] : null;

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const formatPrice = (price: number) => {
    const nusdc = price / 1_000_000;
    return `${nusdc} NUSDC`;
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <span className="truncate max-w-[140px]">
          {currentModel?.name || 'Select Model'}
        </span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Floating panel (opens upward) */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-lg max-h-72 overflow-y-auto z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="py-1.5">
            {groupedModels.map((group, groupIdx) => (
              <div key={group.category}>
                {groupIdx > 0 && (
                  <div className="mx-3 my-1 border-t border-[var(--color-border)]" />
                )}
                <div className="px-3 py-1.5">
                  <span className="text-2xs uppercase tracking-wider font-medium text-[var(--color-text-muted)]">
                    {group.label}
                  </span>
                </div>
                {group.models.map(([modelId, model]) => {
                  const isSelected = modelId === selectedModel;
                  return (
                    <button
                      key={modelId}
                      type="button"
                      onClick={() => {
                        onSelectModel(modelId);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 mx-0 text-left transition-colors rounded-none ${
                        isSelected
                          ? 'bg-[var(--color-bg-tertiary)] border-l-2 border-l-br-1d'
                          : 'hover:bg-[var(--color-bg-tertiary)] border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm truncate ${
                          isSelected ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'
                        }`}>
                          {model.name}
                        </span>
                        <span className="text-2xs text-[var(--color-text-muted)]">
                          {model.description}
                        </span>
                      </div>
                      <span className="text-2xs text-[var(--color-text-muted)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 rounded shrink-0 ml-2">
                        {formatPrice(model.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
