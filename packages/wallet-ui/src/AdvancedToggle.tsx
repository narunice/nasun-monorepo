/**
 * Advanced Mode Toggle Component
 *
 * Allows users to switch between simple and advanced wallet modes.
 * Advanced mode reveals additional features like:
 * - Smart Account status
 * - Session Key management
 * - ZK-ID proofs
 * - WalletConnect sessions
 */

import { useUISettingsStore } from './stores/uiSettingsStore';

export interface AdvancedToggleProps {
  /** Custom class name */
  className?: string;
  /** Show description text */
  showDescription?: boolean;
  /** Compact mode (smaller toggle) */
  compact?: boolean;
}

export function AdvancedToggle({
  className = '',
  showDescription = true,
  compact = false,
}: AdvancedToggleProps) {
  const { isAdvancedMode, toggleAdvancedMode } = useUISettingsStore();

  return (
    <div className={`${className}`}>
      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex-1">
          <span
            className={`font-medium text-gray-900 dark:text-white ${
              compact ? 'text-sm' : ''
            }`}
          >
            Advanced Mode
          </span>
          {showDescription && (
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              Show developer tools and detailed settings
            </p>
          )}
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={isAdvancedMode}
          onClick={toggleAdvancedMode}
          className={`relative inline-flex flex-shrink-0 ${
            compact ? 'h-5 w-9' : 'h-6 w-11'
          } border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            isAdvancedMode
              ? 'bg-blue-500'
              : 'bg-gray-200 dark:bg-zinc-600'
          }`}
        >
          <span className="sr-only">Toggle advanced mode</span>
          <span
            className={`pointer-events-none inline-block ${
              compact ? 'h-4 w-4' : 'h-5 w-5'
            } rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
              isAdvancedMode
                ? compact
                  ? 'translate-x-4'
                  : 'translate-x-5'
                : 'translate-x-0'
            }`}
          />
        </button>
      </label>
    </div>
  );
}

export default AdvancedToggle;
