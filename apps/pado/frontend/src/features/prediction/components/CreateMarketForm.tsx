/**
 * CreateMarketForm Component (round-6 plan §2.15)
 *
 * Resolution metadata is split into two fields:
 *  - `resolutionSource` (URL or short text, max 500 chars)
 *  - `resolutionCriteria` (markdown, max 2000 chars)
 *
 * The resolver address must differ from the creator (Move ECreatorIsResolver = 16).
 * The form requires an explicit resolver address (no "use my address" shortcut).
 */

import { useState, useCallback } from 'react';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { usePredictionAdmin } from '../hooks/usePredictionAdmin';

const CATEGORIES = [
  'Crypto',
  'Politics',
  'Entertainment',
  'Sports',
  'Technology',
  'Geopolitics',
  'Finance',
  'Science',
  'Other',
];

const MAX_QUESTION = 500;
const MAX_DESCRIPTION = 2000;
const MAX_RESOLUTION_SOURCE = 500;
const MAX_RESOLUTION_CRITERIA = 2000;

interface CreateMarketFormProps {
  onSuccess?: (digest: string) => void;
  onCancel?: () => void;
}

export function CreateMarketForm({ onSuccess, onCancel }: CreateMarketFormProps) {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const { isLoading, createMarket } = usePredictionAdmin();

  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Crypto');
  const [resolutionSource, setResolutionSource] = useState('');
  const [resolutionCriteria, setResolutionCriteria] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [closeTime, setCloseTime] = useState('12:00');
  const [resolveDate, setResolveDate] = useState('');
  const [resolveTime, setResolveTime] = useState('12:00');
  const [resolver, setResolver] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      if (!question.trim()) return setError('Please enter a question');
      if (!description.trim()) return setError('Please enter a description');
      if (!resolutionSource.trim()) return setError('Please enter a resolution source');
      if (!resolutionCriteria.trim()) return setError('Please enter resolution criteria');
      if (!closeDate) return setError('Please select a close date');
      if (!resolveDate) return setError('Please select a resolve deadline');
      const trimmedResolver = resolver.trim();
      if (!trimmedResolver) return setError('Please enter a resolver address');
      if (!isValidSuiAddress(trimmedResolver)) {
        return setError('Resolver address is not a valid Sui address.');
      }
      // Normalize so 0x-prefix / leading-zero variants don't slip past the
      // creator-vs-resolver check (Move re-checks on chain via ECreatorIsResolver).
      if (account?.address && normalizeSuiAddress(trimmedResolver) === normalizeSuiAddress(account.address)) {
        return setError('Resolver must differ from the creator address.');
      }

      const closeDateTime = new Date(`${closeDate}T${closeTime}`);
      const resolveDateTime = new Date(`${resolveDate}T${resolveTime}`);

      if (closeDateTime <= new Date()) return setError('Close time must be in the future');
      if (resolveDateTime <= closeDateTime) return setError('Resolve deadline must be after close time');

      // Move-side length caps mirrored locally to fail fast.
      if (question.length > MAX_QUESTION) return setError(`Question must be ≤ ${MAX_QUESTION} chars`);
      if (description.length > MAX_DESCRIPTION) return setError(`Description must be ≤ ${MAX_DESCRIPTION} chars`);
      if (resolutionSource.length > MAX_RESOLUTION_SOURCE) return setError(`Resolution source must be ≤ ${MAX_RESOLUTION_SOURCE} chars`);
      if (resolutionCriteria.length > MAX_RESOLUTION_CRITERIA) return setError(`Resolution criteria must be ≤ ${MAX_RESOLUTION_CRITERIA} chars`);

      const result = await createMarket(
        question.trim(),
        description.trim(),
        category,
        resolutionSource.trim(),
        resolutionCriteria.trim(),
        closeDateTime,
        resolveDateTime,
        trimmedResolver,
      );

      if (result.success) {
        setSuccess(`Market created. Tx: ${result.digest?.slice(0, 8)}...`);
        setQuestion('');
        setDescription('');
        setResolutionSource('');
        setResolutionCriteria('');
        setCloseDate('');
        setResolveDate('');
        setResolver('');
        setTimeout(() => onSuccess?.(result.digest!), 2000);
      } else {
        setError(result.error || 'Failed to create market');
      }
    },
    [
      question,
      description,
      category,
      resolutionSource,
      resolutionCriteria,
      closeDate,
      closeTime,
      resolveDate,
      resolveTime,
      resolver,
      account?.address,
      createMarket,
      onSuccess,
    ],
  );

  const isWalletConnected = status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked;
  const isDisabled = !isWalletConnected || isLoading;
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <h2 className="text-xl font-bold text-theme-text-primary mb-6">Create New Market</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">Question *</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will [event] happen by [date]?"
            disabled={isDisabled}
            maxLength={MAX_QUESTION}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
          />
          <p className="text-xs text-theme-text-muted mt-1">Frame as a yes/no question with a clear date.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short summary visible in market list."
            rows={3}
            disabled={isDisabled}
            maxLength={MAX_DESCRIPTION}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">Resolution Source *</label>
          <input
            type="text"
            value={resolutionSource}
            onChange={(e) => setResolutionSource(e.target.value)}
            placeholder="https://example.com/feed or 'Coinbase BTC/USD spot'"
            disabled={isDisabled}
            maxLength={MAX_RESOLUTION_SOURCE}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
          />
          <p className="text-xs text-theme-text-muted mt-1">URL or short identifier for the data source used to resolve.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">Resolution Criteria * (markdown)</label>
          <textarea
            value={resolutionCriteria}
            onChange={(e) => setResolutionCriteria(e.target.value)}
            placeholder="Detailed conditions for YES vs NO. Markdown supported."
            rows={5}
            disabled={isDisabled}
            maxLength={MAX_RESOLUTION_CRITERIA}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">Close Date *</label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              min={today}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">Close Time</label>
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">Resolve Deadline *</label>
            <input
              type="date"
              value={resolveDate}
              onChange={(e) => setResolveDate(e.target.value)}
              min={closeDate || today}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">Resolve Time</label>
            <input
              type="time"
              value={resolveTime}
              onChange={(e) => setResolveTime(e.target.value)}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">Resolver Address *</label>
          <input
            type="text"
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            placeholder="0x... (must differ from your address)"
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50 font-mono text-sm"
          />
          <p className="text-xs text-theme-text-muted mt-1">
            Creator address: {account?.address?.slice(0, 8)}...{account?.address?.slice(-6)} — resolver must differ.
          </p>
        </div>

        {error && <div className="text-red-500 text-sm bg-red-500/10 rounded-lg p-3">{error}</div>}
        {success && <div className="text-green-500 text-sm bg-green-500/10 rounded-lg p-3">{success}</div>}

        <div className="flex gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 py-2 rounded-lg font-medium text-theme-text-primary bg-theme-bg-tertiary hover:bg-theme-bg-primary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isDisabled}
            className="flex-1 py-2 rounded-lg font-medium text-white bg-pd1 hover:bg-pd1/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? 'Creating...'
              : !isWalletConnected
                ? 'Connect Wallet'
                : 'Create Market'}
          </button>
        </div>
      </form>
    </div>
  );
}
