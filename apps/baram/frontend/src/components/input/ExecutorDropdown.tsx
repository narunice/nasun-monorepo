/**
 * ExecutorDropdown - Combined executor and model selection dropdown
 */

import { useState, useRef, useEffect } from 'react';
import { MODEL_PRICING, ModelId, TEE_TYPES } from '@/config/network';
import type { ExecutorInfo } from '@/features/request/hooks/useExecutors';

interface ExecutorDropdownProps {
  executors: ExecutorInfo[];
  selectedExecutor: ExecutorInfo | null;
  selectedModel: ModelId;
  onExecutorChange: (executor: ExecutorInfo) => void;
  onModelChange: (model: ModelId) => void;
  disabled?: boolean;
}

export function ExecutorDropdown({
  executors,
  selectedExecutor,
  selectedModel,
  onExecutorChange,
  onModelChange,
  disabled = false,
}: ExecutorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModelConfig = MODEL_PRICING[selectedModel];
  const priceDisplay = selectedModelConfig.price === 0
    ? 'Free'
    : `${(selectedModelConfig.price / 1e6).toFixed(2)} NUSDC`;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isTee = selectedExecutor && selectedExecutor.teeType > 0;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {isTee ? (
          <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
            <path d="M12 6v6l4 2" strokeWidth={2} strokeLinecap="round" />
          </svg>
        )}
        <span className="text-[var(--color-text-primary)]">
          {selectedExecutor?.teeTypeName || 'Select'}
        </span>
        <svg className="w-4 h-4 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2 w-80 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Executor Section */}
          <div className="p-3 border-b border-[var(--color-border)]">
            <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">
              Executor
            </div>
            <div className="space-y-1">
              {executors.map((executor) => (
                <button
                  key={executor.operator}
                  onClick={() => {
                    onExecutorChange(executor);
                  }}
                  className={`w-full p-2 rounded-lg text-left transition-colors ${
                    selectedExecutor?.operator === executor.operator
                      ? 'bg-baram-1/10 border border-baram-1/30'
                      : 'hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {executor.teeType > 0 ? (
                        <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        {executor.name}
                      </span>
                    </div>
                    {selectedExecutor?.operator === executor.operator && (
                      <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] ml-6 mt-0.5">
                    {TEE_TYPES[executor.teeType] || 'No TEE'} | Rep: {executor.reputation}/1000
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model Section */}
          <div className="p-3">
            <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">
              Model
            </div>
            <div className="space-y-1">
              {(Object.entries(MODEL_PRICING) as [ModelId, typeof MODEL_PRICING[ModelId]][]).map(([id, config]) => (
                <button
                  key={id}
                  onClick={() => {
                    onModelChange(id);
                    setIsOpen(false);
                  }}
                  className={`w-full p-2 rounded-lg text-left transition-colors ${
                    selectedModel === id
                      ? 'bg-baram-1/10 border border-baram-1/30'
                      : 'hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {config.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${config.price === 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>
                        {config.price === 0 ? 'Free' : `${(config.price / 1e6).toFixed(2)} NUSDC`}
                      </span>
                      {selectedModel === id && (
                        <svg className="w-4 h-4 text-baram-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
