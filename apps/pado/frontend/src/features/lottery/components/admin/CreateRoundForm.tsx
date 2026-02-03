/**
 * Form for creating a new lottery round
 */

import { useState } from 'react';

interface CreateRoundFormProps {
  onSubmit: (closeTime: number, drawTime: number, rollover: bigint) => Promise<void>;
  isLoading: boolean;
}

export function CreateRoundForm({ onSubmit, isLoading }: CreateRoundFormProps) {
  const [closeDate, setCloseDate] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [drawTime, setDrawTime] = useState('');
  const [rollover, setRollover] = useState('0');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = () => {
    setValidationError(null);

    if (!closeDate || !closeTime || !drawDate || !drawTime) {
      setValidationError('Please fill in all date/time fields');
      return;
    }

    const closeTimestamp = new Date(`${closeDate}T${closeTime}`).getTime();
    const drawTimestamp = new Date(`${drawDate}T${drawTime}`).getTime();
    const now = Date.now();

    if (closeTimestamp <= now) {
      setValidationError('Close time must be in the future');
      return;
    }

    if (drawTimestamp <= closeTimestamp) {
      setValidationError('Draw time must be after close time');
      return;
    }

    const rolloverAmount = BigInt(Math.floor(parseFloat(rollover || '0') * 1_000_000));
    onSubmit(closeTimestamp, drawTimestamp, rolloverAmount);
  };

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4">Create New Round</h3>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">Close Date</label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">Close Time</label>
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">Draw Date</label>
            <input
              type="date"
              value={drawDate}
              onChange={(e) => setDrawDate(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-theme-text-secondary mb-1">Draw Time</label>
            <input
              type="time"
              value={drawTime}
              onChange={(e) => setDrawTime(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-theme-text-secondary mb-1">
            Rollover Amount (NUSDC)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rollover}
            onChange={(e) => setRollover(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary"
          />
          <div className="text-xs text-theme-text-secondary mt-1">
            Amount to carry over from previous rounds
          </div>
        </div>

        {validationError && <div className="text-red-500 text-sm">{validationError}</div>}

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full py-2 bg-theme-accent hover:opacity-90 text-white rounded-lg font-medium disabled:opacity-50 transition-opacity"
        >
          {isLoading ? 'Creating...' : 'Create Round'}
        </button>
      </div>
    </div>
  );
}
