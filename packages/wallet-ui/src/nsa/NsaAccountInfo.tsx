/**
 * NsaAccountInfo Component
 * Displays SmartAccount state, signer list, and navigation to sub-flows
 */

import { useEffect } from 'react';
import {
  useNasunSmartAccount,
  useNsaStore,
  type NsaSignerInfo,
} from '@nasun/wallet';
import { CopyableAddress } from '../CopyableAddress';

interface NsaAccountInfoProps {
  onClose: () => void;
  onNavigate: (mode: string) => void;
}

const SIGNER_TYPE_LABELS: Record<string, string> = {
  zklogin: 'zkLogin',
  passkey: 'Passkey',
  local: 'Local',
  hardware: 'Hardware',
};

function SignerBadge({ info }: { info: NsaSignerInfo }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white dark:bg-zinc-700 rounded">
      <div className="flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded font-medium">
          {SIGNER_TYPE_LABELS[info.signerType] || info.signerType}
        </span>
        <span className="text-xs text-gray-500 dark:text-zinc-400 truncate max-w-[100px]">
          {info.label || 'Unnamed'}
        </span>
      </div>
      <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">
        {info.address.slice(0, 6)}...{info.address.slice(-4)}
      </span>
    </div>
  );
}

function TrinityProgress({ accountState }: { accountState: { signers: NsaSignerInfo[]; guardians: string[] } | null }) {
  const hasMultipath = (accountState?.signers?.length ?? 0) >= 2;
  const hasBackup = typeof window !== 'undefined' && localStorage.getItem('nasun:nsa-backup-created') === 'true';
  const hasGuardian = (accountState?.guardians?.length ?? 0) > 0;
  const completed = [hasMultipath, hasBackup, hasGuardian].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-zinc-400">Security Level</span>
        <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">{completed}/3</span>
      </div>
      <div className="flex gap-1">
        {[hasMultipath, hasBackup, hasGuardian].map((done, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full ${done ? 'bg-green-500' : 'bg-gray-200 dark:bg-zinc-600'}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-zinc-500">
        <span>Multipath</span>
        <span>Backup</span>
        <span>Guardian</span>
      </div>
    </div>
  );
}

export function NsaAccountInfo({ onClose, onNavigate }: NsaAccountInfoProps) {
  const { accountState, accountObjectId, isLoading, refreshState } = useNasunSmartAccount();
  const activeRecoveryId = useNsaStore((s) => s.activeRecoveryId);

  useEffect(() => {
    refreshState();
  }, []);

  return (
    <div className="p-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Smart Account</h3>
        </div>
        <button
          onClick={() => refreshState()}
          disabled={isLoading}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {isLoading && !accountState ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-2/3" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account ID */}
          {accountObjectId && (
            <div className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-zinc-400">Account ID</span>
              <CopyableAddress address={accountObjectId} startChars={10} endChars={6} />
            </div>
          )}

          {/* Trinity Security Progress */}
          <TrinityProgress accountState={accountState} />

          {/* Signers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                Signers ({accountState?.signers?.length ?? 0}/5)
              </span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                Threshold: {accountState?.threshold ?? 1}
              </span>
            </div>
            <div className="space-y-1">
              {accountState?.signers?.map((s) => (
                <SignerBadge key={s.address} info={s} />
              ))}
            </div>
          </div>

          {/* Guardians */}
          <div className="space-y-1">
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              Guardians: {accountState?.guardians?.length ?? 0}
              {accountState?.guardianThreshold ? ` (${accountState.guardianThreshold} required)` : ''}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-zinc-700">
            <button
              onClick={() => onNavigate('nsa-add-signer')}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Signer
            </button>

            <button
              onClick={() => onNavigate('nsa-backup')}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Backup
            </button>

            <button
              onClick={() => onNavigate('nsa-guardians')}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Guardians
            </button>

            {activeRecoveryId && (
              <button
                onClick={() => onNavigate('nsa-recovery')}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Active Recovery
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
