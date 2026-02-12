/**
 * Auto-Lock Setup Component
 * Simplified auto-lock timer selection shown during wallet creation flow.
 */

import { useState } from 'react';
import { useSecuritySettings, DEFAULT_SECURITY_SETTINGS } from '@nasun/wallet';

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Disabled (not recommended)' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes (recommended)' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

interface AutoLockSetupProps {
  onComplete: () => void;
}

export function AutoLockSetup({ onComplete }: AutoLockSetupProps) {
  const [selected, setSelected] = useState(DEFAULT_SECURITY_SETTINGS.autoLockMinutes);
  const { updateSecuritySettings } = useSecuritySettings();

  const handleContinue = () => {
    updateSecuritySettings({ autoLockMinutes: selected });
    onComplete();
  };

  return (
    <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
      <h3 className="text-base md:text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Set Auto-Lock Timer
      </h3>

      <p className="text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-4">
        Your wallet will automatically lock after this period of inactivity.
      </p>

      <div className="space-y-2 mb-4">
        {AUTO_LOCK_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setSelected(option.value)}
            className={`w-full px-4 py-3 rounded border text-left text-sm xl:text-base transition-colors ${
              selected === option.value
                ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{option.label}</span>
              {selected === option.value && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={handleContinue}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors text-sm xl:text-base"
      >
        Continue
      </button>
    </div>
  );
}
