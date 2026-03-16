/**
 * Interface Mode Toggle Component
 *
 * Segment-style switch: Simple [track ●] Pro
 * Labels sit outside the track, dot slides inside.
 */

import { useUISettingsStore } from '../stores/uiSettingsStore';

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

  const textSize = compact ? 'text-xs xl:text-sm' : 'text-xs xl:text-sm';

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between">
        {showDescription && (
          <div className="flex-1">
            <span
              className={`font-medium text-gray-900 dark:text-white ${
                compact ? 'text-sm xl:text-base' : ''
              }`}
            >
              Interface
            </span>
            <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
              Switch between simple and pro interface.
              {' '}
              <span className="text-amber-600 dark:text-amber-400">
                External chain support is experimental.
              </span>
            </p>
          </div>
        )}

        {/* Simple [track] Pro */}
        <div
          className="inline-flex items-center gap-2 cursor-pointer"
          onClick={toggleAdvancedMode}
          role="switch"
          aria-checked={isAdvancedMode}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAdvancedMode(); } }}
        >
          {/* Simple label — outside track */}
          <span
            className={`${textSize} font-medium select-none transition-colors duration-200 ${
              !isAdvancedMode
                ? 'text-gray-800 dark:text-zinc-200'
                : 'text-gray-300 dark:text-zinc-500'
            }`}
          >
            Simple
          </span>

          {/* Track with sliding dot */}
          <span
            className={`relative inline-flex items-center ${
              compact ? 'h-5 w-9' : 'h-6 w-11'
            } rounded-full bg-white dark:bg-zinc-800 shadow-sm flex-shrink-0`}
          >
            <span
              className={`inline-block ${
                compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
              } rounded-full bg-blue-500 shadow-sm transition-transform duration-200 ease-in-out ${
                isAdvancedMode
                  ? compact ? 'translate-x-[18px]' : 'translate-x-[22px]'
                  : 'translate-x-[3px]'
              }`}
            />
          </span>

          {/* Pro label — outside track */}
          <span
            className={`${textSize} font-medium select-none transition-colors duration-200 ${
              isAdvancedMode
                ? 'text-gray-800 dark:text-zinc-200'
                : 'text-gray-300 dark:text-zinc-500'
            }`}
          >
            Pro
          </span>
        </div>
      </div>
    </div>
  );
}

export default AdvancedToggle;
