/**
 * SecuritySettings Component
 * Configure wallet security options: auto-lock timeout, transaction confirmation
 */

import { useSecuritySettings, DEFAULT_SECURITY_SETTINGS } from '@nasun/wallet';
import { AdvancedToggle } from '../advanced/AdvancedToggle';
import { SessionKeyPanel } from '../advanced/SessionKeyPanel';
import { ZKIDManager } from '../social/ZKIDManager';
import { useAdvancedMode } from '../stores';
import { PanelHeader } from '../shared';

interface SecuritySettingsProps {
  onClose?: () => void;
}

const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Disabled' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

const THRESHOLD_OPTIONS = [
  { value: 10, label: '10 NSN' },
  { value: 50, label: '50 NSN' },
  { value: 100, label: '100 NSN' },
  { value: 500, label: '500 NSN' },
  { value: 1000, label: '1,000 NSN' },
];

export function SecuritySettings({ onClose }: SecuritySettingsProps) {
  const { security, updateSecuritySettings } = useSecuritySettings();
  const isAdvancedMode = useAdvancedMode();

  const handleAutoLockChange = (minutes: number) => {
    updateSecuritySettings({ autoLockMinutes: minutes });
  };

  const handleThresholdChange = (threshold: number) => {
    updateSecuritySettings({ largeTransactionThreshold: threshold });
  };

  const handleConfirmLargeTxToggle = () => {
    updateSecuritySettings({
      confirmLargeTransactions: !security.confirmLargeTransactions,
    });
  };

  const handleResetDefaults = () => {
    updateSecuritySettings(DEFAULT_SECURITY_SETTINGS);
  };

  return (
    <div className="p-4 w-full">
      <PanelHeader
        title="Security Settings"
        onClose={onClose}
        titleIcon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        }
      />

      <div className="space-y-4">
        {/* Auto-lock timeout */}
        <div>
          <label className="block text-sm xl:text-base text-gray-500 dark:text-zinc-400 mb-1.5">
            Auto-lock Timeout
          </label>
          <p className="text-sm xl:text-base text-gray-400 dark:text-zinc-500 mb-2">
            Automatically lock wallet after inactivity
          </p>
          <select
            value={security.autoLockMinutes}
            onChange={(e) => handleAutoLockChange(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {AUTO_LOCK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Confirm large transactions toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm xl:text-base text-gray-900 dark:text-white">
              Confirm Large Transactions
            </label>
            <p className="text-sm xl:text-base text-gray-400 dark:text-zinc-500 mt-0.5">
              Require extra confirmation for large amounts
            </p>
          </div>
          <button
            onClick={handleConfirmLargeTxToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              security.confirmLargeTransactions ? 'bg-blue-600' : 'bg-gray-300 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                security.confirmLargeTransactions ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Large transaction threshold */}
        {security.confirmLargeTransactions && (
          <div>
            <label className="block text-sm xl:text-base text-gray-500 dark:text-zinc-400 mb-1.5">
              Large Transaction Threshold
            </label>
            <p className="text-sm xl:text-base text-gray-400 dark:text-zinc-500 mb-2">
              Transactions above this amount require confirmation
            </p>
            <select
              value={security.largeTransactionThreshold}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {THRESHOLD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-zinc-700 my-4" />

        {/* Pro Mode Toggle */}
        <AdvancedToggle />

        {/* Pro Mode Features */}
        {isAdvancedMode && (
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
            {/* Session Keys */}
            <SessionKeyPanel compact />

            {/* ZK-ID Proofs */}
            <ZKIDManager compact />
          </div>
        )}

        {/* Security tips */}
        <div className="bg-gray-100 dark:bg-zinc-700/50 rounded p-3 mt-4">
          <h4 className="text-xs xl:text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Security Tips
          </h4>
          <ul className="text-sm xl:text-base text-gray-500 dark:text-zinc-400 space-y-1">
            <li>• Never share your private key or mnemonic</li>
            <li>• Always verify recipient addresses</li>
            <li>• Use auto-lock for added protection</li>
          </ul>
        </div>

        {/* Reset to defaults */}
        <button
          onClick={handleResetDefaults}
          className="w-full px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white border border-gray-300 dark:border-zinc-600 hover:border-gray-400 dark:hover:border-zinc-500 rounded transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
