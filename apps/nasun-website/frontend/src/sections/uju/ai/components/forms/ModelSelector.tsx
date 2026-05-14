/**
 * ModelSelector - Custom dropdown for AI model selection. Models grouped by
 * category (Cloud / Private / Fast). Trader configs use the full catalog
 * (no privacy-mode filter; that lives in chat which is S5+).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MODEL_PRICING,
  MODEL_CATEGORY_LABELS,
  MODEL_CATEGORY_ORDER,
  type ModelId,
} from '../../services/network';

interface ModelSelectorProps {
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, onSelectModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allowedModels = Object.entries(MODEL_PRICING);
  const groupedModels = MODEL_CATEGORY_ORDER.map((category) => ({
    category,
    label: MODEL_CATEGORY_LABELS[category],
    models: allowedModels.filter(([, m]) => m.category === category),
  })).filter((g) => g.models.length > 0);

  const currentModel = selectedModel ? MODEL_PRICING[selectedModel as ModelId] : null;

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const formatPrice = (price: number) => `${price / 1_000_000} NUSDC`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-uju-bg border border-uju-border/60 text-sm font-medium text-uju-secondary hover:bg-uju-card/60 hover:text-white transition-colors"
      >
        <span className="truncate max-w-[180px]">{currentModel?.name || 'Select Model'}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-72 bg-uju-card border border-uju-border/60 rounded-xl shadow-lg max-h-72 overflow-y-auto z-50">
          <div className="py-1.5" role="listbox">
            {groupedModels.map((group, groupIdx) => (
              <div key={group.category}>
                {groupIdx > 0 && <div className="mx-3 my-1 border-t border-uju-border/60" />}
                <div className="px-3 py-1.5">
                  <span className="text-xs uppercase tracking-wider font-medium text-uju-secondary/70">
                    {group.label}
                  </span>
                </div>
                {group.models.map(([modelId, model]) => {
                  const isSelected = modelId === selectedModel;
                  return (
                    <button
                      type="button"
                      key={modelId}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectModel(modelId);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                        isSelected ? 'bg-uju-bg border-l-2 border-l-pado-2' : 'hover:bg-uju-bg border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm truncate ${isSelected ? 'text-white font-medium' : 'text-uju-secondary'}`}>
                          {model.name}
                        </span>
                        <span className="text-xs text-uju-secondary/70">{model.description}</span>
                      </div>
                      <span className="text-xs text-uju-secondary/70 bg-uju-bg px-1.5 py-0.5 rounded shrink-0 ml-2">
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
