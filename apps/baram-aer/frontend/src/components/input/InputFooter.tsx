/**
 * InputFooter - Shows privacy mode, model info, and request stats below input
 */

import { MODEL_PRICING, ModelId, PRIVACY_MODE_CONFIG } from '@/config/network';

interface InputFooterProps {
  selectedModel: ModelId | string | null;
  privacyMode: boolean;
  requestId?: number;
  executionTime?: number;
}

export function InputFooter({
  selectedModel,
  privacyMode,
  requestId,
  executionTime,
}: InputFooterProps) {
  const modelConfig = selectedModel ? MODEL_PRICING[selectedModel as ModelId] : null;
  const modeConfig = privacyMode ? PRIVACY_MODE_CONFIG.private : PRIVACY_MODE_CONFIG.standard;

  return (
    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mt-2 px-1">
      <div className="flex items-center gap-2">
        <span className={privacyMode ? 'text-[var(--color-success)]' : ''}>
          {modeConfig.label}
        </span>
        <span className="text-[var(--color-border)]">|</span>
        <span>{modelConfig?.name || 'Select model'}</span>
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
