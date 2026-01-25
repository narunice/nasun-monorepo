/**
 * Purpose Selector Component
 *
 * Onboarding component for selecting user's primary purpose.
 * This helps personalize the wallet experience and
 * affects default views and shortcuts.
 */

import { useUISettingsStore } from './stores/uiSettingsStore';
import type { UserPurpose } from './types/navigation';

export interface PurposeSelectorProps {
  /** Callback when purpose is selected and onboarding completes */
  onComplete?: () => void;
  /** Custom class name */
  className?: string;
}

interface PurposeOption {
  value: UserPurpose;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const PURPOSE_OPTIONS: PurposeOption[] = [
  {
    value: 'asset',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
    title: 'Asset Management',
    description: 'Track and manage your tokens',
  },
  {
    value: 'invest',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    title: 'Investment',
    description: 'Stake and earn rewards',
  },
  {
    value: 'nft',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
    title: 'NFT Collection',
    description: 'Collect and trade NFTs',
  },
  {
    value: 'all',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    ),
    title: 'All Features',
    description: 'Explore everything',
  },
];

export function PurposeSelector({
  onComplete,
  className = '',
}: PurposeSelectorProps) {
  const { setUserPurpose, completeOnboarding } = useUISettingsStore();

  const handleSelect = (purpose: UserPurpose) => {
    setUserPurpose(purpose);
    completeOnboarding();
    onComplete?.();
  };

  return (
    <div className={`p-4 ${className}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          What brings you here?
        </h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Choose your primary use case to personalize your experience
        </p>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-2 gap-3">
        {PURPOSE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            className="flex flex-col items-center p-4 rounded-md border-2 border-gray-200 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all group"
          >
            <div className="p-3 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-3">
              {option.icon}
            </div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">
              {option.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 text-center">
              {option.description}
            </p>
          </button>
        ))}
      </div>

      {/* Skip link */}
      <div className="text-center mt-4">
        <button
          onClick={() => handleSelect('all')}
          className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default PurposeSelector;
