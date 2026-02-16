/**
 * NsaGuardianConnect - Guardian connection flow
 *
 * Discovers SmartAccounts where the current user is a guardian,
 * or allows manual entry of an account object ID.
 * Returns a GuardianContext for NsaRecoveryPanel to operate on.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useSigner,
  fetchAccountState,
  findAccountsWhereGuardian,
} from '@nasun/wallet';
import type { NsaAccountState, GuardedAccountInfo } from '@nasun/wallet';

export interface GuardianContext {
  accountObjectId: string;
  accountState: NsaAccountState;
  activeRecoveryId: string | null;
}

interface NsaGuardianConnectProps {
  onClose: () => void;
  onConnected: (ctx: GuardianContext) => void;
}

type Step = 'discovering' | 'list' | 'manual' | 'verifying';

export function NsaGuardianConnect({ onClose, onConnected }: NsaGuardianConnectProps) {
  const { address } = useSigner();
  const [step, setStep] = useState<Step>('discovering');
  const [accounts, setAccounts] = useState<GuardedAccountInfo[]>([]);
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auto-discover accounts where current user is a guardian
  useEffect(() => {
    if (!address) {
      setStep('manual');
      return;
    }

    let cancelled = false;

    const discover = async () => {
      try {
        const found = await findAccountsWhereGuardian(address);
        if (cancelled) return;

        if (found.length > 0) {
          setAccounts(found);
          setStep('list');
        } else {
          setStep('manual');
        }
      } catch {
        if (!cancelled) setStep('manual');
      }
    };

    discover();
    return () => { cancelled = true; };
  }, [address]);

  const handleSelectAccount = useCallback((info: GuardedAccountInfo) => {
    onConnected({
      accountObjectId: info.accountState.objectId,
      accountState: info.accountState,
      activeRecoveryId: info.activeRecoveryId,
    });
  }, [onConnected]);

  const handleManualConnect = useCallback(async () => {
    const id = manualId.trim();
    if (!id || !address) return;

    setError(null);
    setStep('verifying');

    try {
      const state = await fetchAccountState(id);
      const normalizedAddr = address.toLowerCase();
      const isGuardian = state.guardians.some(
        (g) => g.toLowerCase() === normalizedAddr,
      );

      if (!isGuardian) {
        setError('You are not a guardian of this account.');
        setStep('manual');
        return;
      }

      onConnected({
        accountObjectId: state.objectId,
        accountState: state,
        activeRecoveryId: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch account');
      setStep('manual');
    }
  }, [manualId, address, onConnected]);

  // Discovering step
  if (step === 'discovering') {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
            Guardian Connect
          </h3>
        </div>
        <div className="flex flex-col items-center py-8">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-600 dark:text-zinc-300">Discovering guarded accounts...</p>
        </div>
      </div>
    );
  }

  // Account list step
  if (step === 'list') {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
            Guardian Connect
          </h3>
        </div>

        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-3">
          Select an account you are guarding:
        </p>

        <div className="space-y-2 mb-4">
          {accounts.map((info) => (
            <button
              key={info.accountState.objectId}
              onClick={() => handleSelectAccount(info)}
              className="w-full p-3 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg text-left transition-colors"
            >
              <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 break-all">
                {info.accountState.objectId}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400 dark:text-zinc-500">
                  {info.accountState.signers.length} signer{info.accountState.signers.length !== 1 ? 's' : ''}
                </span>
                {info.activeRecoveryId && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Recovery Active
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setStep('manual')}
          className="w-full text-xs xl:text-sm text-blue-500 hover:text-blue-600 transition-colors"
        >
          Enter account ID manually
        </button>
      </div>
    );
  }

  // Verifying step
  if (step === 'verifying') {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setStep('manual')}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
            Guardian Connect
          </h3>
        </div>
        <div className="flex flex-col items-center py-8">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-600 dark:text-zinc-300">Verifying guardian status...</p>
        </div>
      </div>
    );
  }

  // Manual entry step
  return (
    <div className="p-4 w-full">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={accounts.length > 0 ? () => setStep('list') : onClose}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
          Guardian Connect
        </h3>
      </div>

      <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-3">
        Enter the SmartAccount object ID to connect as a guardian.
      </p>

      <div className="space-y-3">
        <input
          type="text"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && manualId.trim() && handleManualConnect()}
          placeholder="0x..."
          className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm xl:text-base"
        />

        {error && (
          <p className="text-xs xl:text-sm text-red-400">{error}</p>
        )}

        <button
          onClick={handleManualConnect}
          disabled={!manualId.trim()}
          className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm xl:text-base transition-colors"
        >
          Connect
        </button>
      </div>
    </div>
  );
}
