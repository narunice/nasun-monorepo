/**
 * InlineRecoveryView
 *
 * Renders the AssetRecoveryPanel inside the wallet dropdown.
 * Automatically includes Pado BM, Margin, and Prediction adapters.
 * Extra adapters can be injected via the extraAdapters prop.
 */

import { useMemo } from 'react';
import type { ViewMode } from '../connect/types';
import { useSignAndExecute } from '../hooks/useSignAndExecute';
import { AssetRecoveryPanel } from './AssetRecoveryPanel';
import type { RecoveryAdapter } from './types';
import { createPadoBmAdapter } from './adapters/padoBmAdapter';
import { createPadoMarginAdapter } from './adapters/padoMarginAdapter';
import { createPadoPredictionAdapter } from './adapters/padoPredictionAdapter';

interface Props {
  setViewMode: (mode: ViewMode) => void;
  extraAdapters?: RecoveryAdapter[];
}

export function InlineRecoveryView({ setViewMode, extraAdapters }: Props) {
  const { address, signAndExecute } = useSignAndExecute();

  const adapters = useMemo<RecoveryAdapter[]>(() => [
    createPadoBmAdapter(signAndExecute, address),
    createPadoMarginAdapter(signAndExecute),
    createPadoPredictionAdapter(signAndExecute),
    ...(extraAdapters ?? []),
  ], [signAndExecute, address, extraAdapters]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200 dark:border-zinc-700">
        <button
          onClick={() => setViewMode('main')}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-base xl:text-lg font-medium text-gray-900 dark:text-white">Recover Funds</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <AssetRecoveryPanel adapters={adapters} address={address} />
      </div>
    </div>
  );
}
