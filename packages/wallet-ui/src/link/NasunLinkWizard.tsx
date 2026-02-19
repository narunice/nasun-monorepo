/**
 * Nasun Link Wizard Component
 *
 * A 3-step wizard for creating claimable Nasun Links.
 * Step 1: Select token and amount
 * Step 2: Configure conditions (expiration, max claims, password)
 * Step 3: Review and create link
 */

import { useState, useCallback } from 'react';
import {
  useNasunLink,
  useBalance,
  useMultiBalance,
  useWallet,
  useZkLogin,
  usePasskey,
} from '@nasun/wallet';
import type { LinkConfig, LinkType, ClaimCondition, LinkURL, LinkData } from '@nasun/wallet';

export interface NasunLinkWizardProps {
  /** Callback when link is created successfully */
  onSuccess?: (url: LinkURL, data: LinkData) => void;
  /** Callback when wizard is cancelled */
  onCancel?: () => void;
  /** Custom class name */
  className?: string;
  /** Default coin type */
  defaultCoinType?: string;
  /** Show advanced options (ZK-ID conditions) */
  showAdvanced?: boolean;
}

type WizardStep = 'amount' | 'conditions' | 'result';

interface FormState {
  coinType: string;
  amount: string;
  linkType: LinkType;
  maxClaims: number;
  expirationHours: number;
  message: string;
  requirePassword: boolean;
  password: string;
}

const DEFAULT_FORM: FormState = {
  coinType: 'NSN',
  amount: '',
  linkType: 'single',
  maxClaims: 10,
  expirationHours: 24,
  message: '',
  requirePassword: false,
  password: '',
};

// Token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  NSN: 9,
  SUI: 9,
  NUSDC: 6,
  NBTC: 8,
};

function parseAmount(amount: string, decimals: number): bigint {
  if (!amount || amount === '0') return 0n;

  const parts = amount.split('.');
  const whole = parts[0] || '0';
  let fractional = parts[1] || '';

  // Pad or truncate fractional part
  if (fractional.length > decimals) {
    fractional = fractional.slice(0, decimals);
  } else {
    fractional = fractional.padEnd(decimals, '0');
  }

  return BigInt(whole + fractional);
}

function formatBalance(balance: bigint, decimals: number): string {
  const str = balance.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals) || '0';
  const fractional = str.slice(-decimals).replace(/0+$/, '');

  if (fractional) {
    return `${whole}.${fractional}`;
  }
  return whole;
}

export function NasunLinkWizard({
  onSuccess,
  onCancel,
  className = '',
  defaultCoinType = 'NSN',
  showAdvanced: _showAdvanced, // Reserved for future ZK-ID conditions UI
}: NasunLinkWizardProps) {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { isUnlocked: isPasskeyUnlocked } = usePasskey();
  const { create, isLoading, error, clearError, canCreate } = useNasunLink();
  const { data: nasunBalance } = useBalance();
  const { data: multiBalances } = useMultiBalance();

  const [step, setStep] = useState<WizardStep>('amount');
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    coinType: defaultCoinType,
  });
  const [createdLink, setCreatedLink] = useState<{ url: LinkURL; data: LinkData } | null>(null);
  const [copied, setCopied] = useState(false);

  const isConnected = status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked;

  // Get balance for selected token
  const getTokenBalance = (): bigint => {
    if (form.coinType === 'NSN') {
      return BigInt(nasunBalance?.totalBalance ?? '0');
    }
    const tokenBalance = multiBalances?.tokens[form.coinType];
    return tokenBalance?.balance ?? 0n;
  };

  const decimals = TOKEN_DECIMALS[form.coinType] ?? 9;
  const tokenBalance = getTokenBalance();
  const parsedAmount = parseAmount(form.amount, decimals);
  const hasEnoughBalance = parsedAmount > 0n && parsedAmount <= tokenBalance;

  // Handle form changes
  const updateForm = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      clearError();
    },
    [clearError]
  );

  // Create the link
  const handleCreate = useCallback(async () => {
    const conditions: ClaimCondition[] = [];

    if (form.requirePassword && form.password) {
      // Hash password for storage (simplified - in production use proper hashing)
      const encoder = new TextEncoder();
      const data = encoder.encode(form.password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      conditions.push({ type: 'password', hash: hashHex });
    }

    const config: LinkConfig = {
      type: form.linkType,
      coinType: form.coinType,
      amount: parsedAmount,
      message: form.message || undefined,
      maxClaims: form.linkType !== 'single' ? form.maxClaims : undefined,
      expiresAt: form.expirationHours > 0
        ? Date.now() + form.expirationHours * 60 * 60 * 1000
        : undefined,
      conditions: conditions.length > 0 ? conditions : undefined,
    };

    try {
      const result = await create(config);
      setCreatedLink(result);
      setStep('result');
      onSuccess?.(result.url, result.data);
    } catch {
      // Error is handled by useNasunLink
    }
  }, [form, parsedAmount, create, onSuccess]);

  // Copy link to clipboard
  const handleCopy = useCallback(async () => {
    if (!createdLink) return;

    try {
      await navigator.clipboard.writeText(createdLink.url.fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = createdLink.url.fullUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [createdLink]);

  // Not connected state
  if (!isConnected) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <svg
          className="w-12 h-12 text-gray-400 dark:text-zinc-600 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          Connect wallet to create Nasun Links
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-6 px-4 py-2.5 text-sm text-gray-600 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  // Cannot create (no local signer)
  if (!canCreate) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <svg
          className="w-12 h-12 text-yellow-400 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          Link creation requires a local or passkey wallet.
        </p>
        <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-500 mt-1">
          zkLogin wallets cannot create links yet.
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-6 px-4 py-2.5 text-sm text-gray-600 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  // Step 1: Amount selection
  if (step === 'amount') {
    return (
      <div className={className}>
        <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white mb-4">
          Create Nasun Link
        </h3>

        {/* Token selector */}
        <div className="mb-4">
          <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Token
          </label>
          <select
            value={form.coinType}
            onChange={(e) => updateForm('coinType', e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="NSN">NSN</option>
            <option value="NUSDC">NUSDC</option>
            <option value="NBTC">NBTC</option>
          </select>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Amount
          </label>
          <div className="relative">
            <input
              type="text"
              value={form.amount}
              onChange={(e) => updateForm('amount', e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="w-full px-3 py-2 pr-16 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm xl:text-base text-gray-500 dark:text-zinc-400">
              {form.coinType}
            </span>
          </div>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Balance: {formatBalance(tokenBalance, decimals)} {form.coinType}
          </p>
        </div>

        {/* Link type */}
        <div className="mb-4">
          <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Link Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'single', label: 'Single', desc: '1 claim' },
              { value: 'multi', label: 'Multi', desc: 'N claims' },
              { value: 'first-n', label: 'Race', desc: 'First N' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateForm('linkType', opt.value as LinkType)}
                className={`px-3 py-2 rounded-lg border text-sm xl:text-base transition-colors ${
                  form.linkType === opt.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'border-gray-300 dark:border-zinc-600 hover:border-gray-400 dark:hover:border-zinc-500'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="block text-xs xl:text-sm text-gray-500 dark:text-zinc-400">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div className="mb-6">
          <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Message (optional)
          </label>
          <input
            type="text"
            value={form.message}
            onChange={(e) => updateForm('message', e.target.value)}
            placeholder="Welcome gift!"
            maxLength={100}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Validation error */}
        {parsedAmount > 0n && !hasEnoughBalance && (
          <p className="text-sm xl:text-base text-red-500 mb-4">Insufficient balance</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => setStep('conditions')}
            disabled={!hasEnoughBalance}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white disabled:text-gray-500 dark:disabled:text-zinc-400 rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Conditions
  if (step === 'conditions') {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setStep('amount')}
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">
            Link Conditions
          </h3>
        </div>

        {/* Max claims (for multi/first-n) */}
        {form.linkType !== 'single' && (
          <div className="mb-4">
            <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Max Claims
            </label>
            <input
              type="number"
              value={form.maxClaims}
              onChange={(e) => updateForm('maxClaims', parseInt(e.target.value) || 1)}
              min={1}
              max={1000}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-1">
              Total: {formatBalance(parsedAmount * BigInt(form.maxClaims), decimals)} {form.coinType}
            </p>
          </div>
        )}

        {/* Expiration */}
        <div className="mb-4">
          <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Expires In
          </label>
          <select
            value={form.expirationHours}
            onChange={(e) => updateForm('expirationHours', parseInt(e.target.value))}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
            <option value={0}>Never</option>
          </select>
        </div>

        {/* Password protection */}
        <div className="mb-6">
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requirePassword}
              onChange={(e) => updateForm('requirePassword', e.target.checked)}
              className="w-4 h-4 text-blue-500 rounded focus:ring-blue-500"
            />
            <span className="text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300">
              Password protect
            </span>
          </label>
          {form.requirePassword && (
            <input
              type="text"
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
              placeholder="Enter password"
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4 mb-6">
          <h4 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-2">Summary</h4>
          <div className="space-y-1 text-sm xl:text-base text-gray-600 dark:text-zinc-400">
            <p>Amount: {form.amount} {form.coinType}</p>
            <p>Type: {form.linkType === 'single' ? 'Single use' : `${form.maxClaims} claims`}</p>
            <p>Expires: {form.expirationHours > 0 ? `${form.expirationHours}h` : 'Never'}</p>
            {form.requirePassword && <p>Password protected</p>}
            {form.message && <p>Message: "{form.message}"</p>}
          </div>
        </div>

        {/* Error */}
        {error && <p className="text-sm xl:text-base text-red-500 mb-4">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => setStep('amount')}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || (form.requirePassword && !form.password)}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white disabled:text-gray-500 dark:disabled:text-zinc-400 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              'Create Link'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Step 3: Result
  if (step === 'result' && createdLink) {
    return (
      <div className={className}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">
            Link Created!
          </h3>
          <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400 mt-1">
            Share this link with the recipient
          </p>
        </div>

        {/* Link display */}
        <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-4 mb-4">
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-1 font-mono break-all">
            {createdLink.url.fullUrl}
          </p>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                />
              </svg>
              Copy Link
            </>
          )}
        </button>

        {/* Info */}
        <div className="mt-4 space-y-2 text-sm xl:text-base text-gray-600 dark:text-zinc-400">
          <p>Amount: {form.amount} {form.coinType}</p>
          {form.expirationHours > 0 && (
            <p>
              Expires:{' '}
              {new Date(Date.now() + form.expirationHours * 60 * 60 * 1000).toLocaleString('en-US')}
            </p>
          )}
        </div>

        {/* Create another */}
        <button
          onClick={() => {
            setStep('amount');
            setCreatedLink(null);
            setForm(DEFAULT_FORM);
          }}
          className="w-full mt-4 px-4 py-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          Create Another Link
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-2 px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  return null;
}
