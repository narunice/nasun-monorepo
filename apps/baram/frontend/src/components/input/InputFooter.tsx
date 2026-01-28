/**
 * InputFooter - Shows current model, price, and executor info below input
 */

import { MODEL_PRICING, ModelId } from '@/config/network';
import type { ExecutorInfo } from '@/features/request/hooks/useExecutors';

interface InputFooterProps {
  selectedModel: ModelId | string | null;
  selectedExecutor: ExecutorInfo | null;
  requestId?: number;
  executionTime?: number;
}

export function InputFooter({
  selectedModel,
  selectedExecutor,
  requestId,
  executionTime,
}: InputFooterProps) {
  const modelConfig = selectedModel ? MODEL_PRICING[selectedModel as ModelId] : null;
  const priceDisplay = !modelConfig
    ? '-'
    : modelConfig.price === 0
      ? 'Free'
      : `${(modelConfig.price / 1e6).toFixed(2)} NUSDC`;

  return (
    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mt-2 px-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span>{modelConfig?.name || 'Select model'}</span>
        <span className="text-[var(--color-border)]">|</span>
        <span className={modelConfig?.price === 0 ? 'text-[var(--color-success)]' : ''}>
          {priceDisplay}
        </span>
        {selectedExecutor && (
          <>
            <span className="text-[var(--color-border)]">|</span>
            <span>{selectedExecutor.teeTypeName}</span>
            <span className="text-[var(--color-border)]">|</span>
            <span>{selectedExecutor.reputation} rep</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {requestId !== undefined && (
          <span>Request #{requestId}</span>
        )}
        {executionTime !== undefined && (
          <span>{(executionTime / 1000).toFixed(2)}s</span>
        )}
      </div>
    </div>
  );
}
