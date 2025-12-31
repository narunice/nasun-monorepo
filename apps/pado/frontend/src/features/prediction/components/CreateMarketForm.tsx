/**
 * CreateMarketForm Component
 * Form for creating new prediction markets (Admin only)
 */

import { useState, useCallback } from 'react';
import { useWallet } from '@nasun/wallet';
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

interface CreateMarketFormProps {
  onSuccess?: (digest: string) => void;
  onCancel?: () => void;
}

export function CreateMarketForm({ onSuccess, onCancel }: CreateMarketFormProps) {
  const { status, account } = useWallet();
  const { isLoading, createMarket } = usePredictionAdmin();

  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Crypto');
  const [closeDate, setCloseDate] = useState('');
  const [closeTime, setCloseTime] = useState('12:00');
  const [resolveDate, setResolveDate] = useState('');
  const [resolveTime, setResolveTime] = useState('12:00');
  const [resolver, setResolver] = useState('');
  const [useCurrentAddress, setUseCurrentAddress] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }
    if (!closeDate) {
      setError('Please select a close date');
      return;
    }
    if (!resolveDate) {
      setError('Please select a resolve deadline');
      return;
    }

    const closeDateTime = new Date(`${closeDate}T${closeTime}`);
    const resolveDateTime = new Date(`${resolveDate}T${resolveTime}`);

    if (closeDateTime <= new Date()) {
      setError('Close time must be in the future');
      return;
    }
    if (resolveDateTime <= closeDateTime) {
      setError('Resolve deadline must be after close time');
      return;
    }

    const resolverAddress = useCurrentAddress ? undefined : resolver.trim();
    if (!useCurrentAddress && !resolverAddress) {
      setError('Please enter a resolver address');
      return;
    }

    const result = await createMarket(
      question.trim(),
      description.trim(),
      category,
      closeDateTime,
      resolveDateTime,
      resolverAddress
    );

    if (result.success) {
      setSuccess(`Market created! Tx: ${result.digest?.slice(0, 8)}...`);
      // Clear form
      setQuestion('');
      setDescription('');
      setCloseDate('');
      setResolveDate('');
      setTimeout(() => {
        onSuccess?.(result.digest!);
      }, 2000);
    } else {
      setError(result.error || 'Failed to create market');
    }
  }, [question, description, category, closeDate, closeTime, resolveDate, resolveTime, resolver, useCurrentAddress, createMarket, onSuccess]);

  const isDisabled = status !== 'unlocked' || isLoading;

  // Get min dates for inputs
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <h2 className="text-xl font-bold text-theme-text-primary mb-6">
        Create New Market
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Question */}
        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">
            Question *
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will [event] happen by [date]?"
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <p className="text-xs text-theme-text-muted mt-1">
            Frame as a yes/no question with clear resolution criteria
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">
            Description *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed resolution criteria..."
            rows={3}
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Close Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">
              Close Date *
            </label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              min={today}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">
              Close Time
            </label>
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Resolve Deadline */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">
              Resolve Deadline *
            </label>
            <input
              type="date"
              value={resolveDate}
              onChange={(e) => setResolveDate(e.target.value)}
              min={closeDate || today}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-text-muted mb-1">
              Resolve Time
            </label>
            <input
              type="time"
              value={resolveTime}
              onChange={(e) => setResolveTime(e.target.value)}
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Resolver */}
        <div>
          <label className="block text-sm font-medium text-theme-text-muted mb-2">
            Resolver Address
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="useCurrentAddress"
              checked={useCurrentAddress}
              onChange={(e) => setUseCurrentAddress(e.target.checked)}
              disabled={isDisabled}
              className="rounded"
            />
            <label htmlFor="useCurrentAddress" className="text-sm text-theme-text-secondary">
              Use my address ({account?.address?.slice(0, 8)}...{account?.address?.slice(-6)})
            </label>
          </div>
          {!useCurrentAddress && (
            <input
              type="text"
              value={resolver}
              onChange={(e) => setResolver(e.target.value)}
              placeholder="0x..."
              disabled={isDisabled}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-mono text-sm"
            />
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="text-red-500 text-sm bg-red-500/10 rounded-lg p-3">
            {error}
          </div>
        )}
        {success && (
          <div className="text-green-500 text-sm bg-green-500/10 rounded-lg p-3">
            {success}
          </div>
        )}

        {/* Actions */}
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
            className="flex-1 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? 'Creating...'
              : status !== 'unlocked'
              ? 'Connect Wallet'
              : 'Create Market'}
          </button>
        </div>
      </form>
    </div>
  );
}
