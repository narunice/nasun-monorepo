/**
 * GettingStartedCard
 *
 * 3-step onboarding checklist: Create Wallet -> Get Tokens -> Trade Spot.
 * Auto-hides when all steps are complete. Manually dismissible via localStorage.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWallet, useBalance, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { ClaimAllButton } from '@nasun/wallet-ui';

const DISMISS_KEY = 'pado:gettingStartedDismissed';
const SPOT_VISITED_KEY = 'pado:spotVisited';

interface Step {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  action?: { label: string; to: string } | { label: string; onClick: () => void };
}

export function GettingStartedCard() {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isWalletConnected = status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked;

  // Poll balance at 3s while wallet connected (card auto-hides on completion)
  const { data: balance } = useBalance(undefined, {
    pollingInterval: isWalletConnected ? 3_000 : undefined,
  });

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === 'true'; } catch { return false; }
  });

  const [hasVisitedSpot] = useState(() => {
    try { return !!localStorage.getItem(SPOT_VISITED_KEY); } catch { return false; }
  });

  const hasBalance = !!balance && Number(balance.totalBalance) > 0;

  const steps: Step[] = useMemo(() => {
    const base: Step[] = [
      {
        id: 'wallet',
        label: 'Create Wallet',
        description: 'Set up your wallet to start trading',
        completed: isWalletConnected,
      },
      {
        id: 'faucet',
        label: 'Get Test Tokens',
        description: 'Use the faucet in your wallet to get free tokens',
        completed: hasBalance,
      },
      {
        id: 'spot',
        label: 'Try Spot Trading',
        description: 'Open the spot market and place your first order',
        completed: hasVisitedSpot,
        action: isWalletConnected && hasBalance
          ? { label: 'Go to Spot', to: '/spot' }
          : undefined,
      },
    ];

    return base;
  }, [isWalletConnected, hasBalance, hasVisitedSpot]);

  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = completedCount === steps.length;

  // Show a brief "All done!" state before hiding the card
  const [showingComplete, setShowingComplete] = useState(false);
  useEffect(() => {
    if (!allComplete || dismissed) return;
    setShowingComplete(true);
    const timer = setTimeout(() => {
      setDismissed(true);
      try { localStorage.setItem(DISMISS_KEY, 'true'); } catch { /* noop */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [allComplete, dismissed]);

  // Don't show if dismissed (but DO show briefly when allComplete via showingComplete)
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, 'true'); } catch { /* noop */ }
  };

  if (showingComplete) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 md:p-5 mb-4 md:mb-6 text-center">
        <p className="text-sm xl:text-base font-semibold text-green-400">
          All set! You're ready to go.
        </p>
        <p className="text-xs xl:text-sm text-theme-text-muted mt-1">
          Check your wallet to see your tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 md:p-5 mb-4 md:mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm xl:text-base font-semibold text-theme-text-primary">Getting Started</h3>
          <p className="text-xs xl:text-sm text-theme-text-muted mt-0.5">
            {completedCount}/{steps.length} completed
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-theme-bg-tertiary rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-start gap-3">
            {/* Checkbox */}
            <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              step.completed
                ? 'bg-green-500 border-green-500'
                : 'border-theme-border'
            }`}>
              {step.completed && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm xl:text-base font-medium ${
                step.completed ? 'text-theme-text-muted line-through' : 'text-theme-text-primary'
              }`}>
                {i + 1}. {step.label}
              </p>
              {!step.completed && (
                <p className="text-xs xl:text-sm text-theme-text-muted mt-0.5">{step.description}</p>
              )}
            </div>

            {/* Action button */}
            {!step.completed && step.action && 'to' in step.action && (
              <Link
                to={step.action.to}
                className="shrink-0 text-xs xl:text-sm font-medium text-pd2 hover:text-pd3 transition-colors"
              >
                {step.action.label} &rarr;
              </Link>
            )}

            {/* Faucet claim button (step 2 only, ClaimAllButton self-guards for devnet/cooldown) */}
            {step.id === 'faucet' && !step.completed && isWalletConnected && (
              <div className="shrink-0 w-48">
                <ClaimAllButton />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
