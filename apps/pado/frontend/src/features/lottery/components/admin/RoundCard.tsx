/**
 * Lottery admin round card with action buttons
 */

import { useState } from 'react';
import { ROUND_STATUS, formatNusdc } from '../../index';
import type { LotteryRound } from '../../types';
import { StatusBadge } from './StatusBadge';

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RoundCardProps {
  round: LotteryRound;
  isLoading: boolean;
  onClose: () => void;
  onDraw: () => void;
  onSettle: (tier1: number, tier2: number, tier3: number) => void;
}

export function RoundCard({ round, isLoading, onClose, onDraw, onSettle }: RoundCardProps) {
  const [tier1Winners, setTier1Winners] = useState(0);
  const [tier2Winners, setTier2Winners] = useState(0);
  const [tier3Winners, setTier3Winners] = useState(0);
  const now = Date.now();

  const canClose = round.status === ROUND_STATUS.OPEN && now >= round.closeTime;
  const canDraw = round.status === ROUND_STATUS.CLOSED && now >= round.drawTime;
  const canSettle = round.status === ROUND_STATUS.DRAWN;

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          Round #{round.roundNumber}
        </h3>
        <StatusBadge status={round.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <div className="text-theme-text-secondary">Prize Pool</div>
          <div className="text-theme-text-primary font-medium">
            {formatNusdc(round.prizePool)} NUSDC
          </div>
        </div>
        <div>
          <div className="text-theme-text-secondary">Tickets Sold</div>
          <div className="text-theme-text-primary font-medium">{round.ticketCount}</div>
        </div>
        <div>
          <div className="text-theme-text-secondary">Close Time</div>
          <div className="text-theme-text-primary font-medium">
            {formatDateTime(round.closeTime)}
          </div>
        </div>
        <div>
          <div className="text-theme-text-secondary">Draw Time</div>
          <div className="text-theme-text-primary font-medium">
            {formatDateTime(round.drawTime)}
          </div>
        </div>
      </div>

      {round.drawnNumbers && (
        <div className="mb-4">
          <div className="text-theme-text-secondary text-sm mb-2">Drawn Numbers</div>
          <div className="flex gap-2">
            {round.drawnNumbers.map((num, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-theme-accent text-white flex items-center justify-center font-medium"
              >
                {num}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {canClose && (
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Close Round'}
          </button>
        )}

        {canDraw && (
          <button
            onClick={onDraw}
            disabled={isLoading}
            className="w-full py-2 bg-pd1 hover:bg-pd1/80 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Draw Numbers'}
          </button>
        )}

        {canSettle && (
          <div className="space-y-3">
            <div className="text-theme-text-secondary text-sm font-medium">
              Enter Winner Counts by Tier
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-yellow-400 mb-1">Tier 1 (5 match)</label>
                <input
                  type="number"
                  min="0"
                  value={tier1Winners}
                  onChange={(e) => setTier1Winners(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-2 py-1 bg-theme-bg-tertiary border border-yellow-500/30 rounded text-theme-text-primary text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-pd3 mb-1">Tier 2 (4 match)</label>
                <input
                  type="number"
                  min="0"
                  value={tier2Winners}
                  onChange={(e) => setTier2Winners(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-2 py-1 bg-theme-bg-tertiary border border-pd2/30 rounded text-theme-text-primary text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-green-400 mb-1">Tier 3 (3 match)</label>
                <input
                  type="number"
                  min="0"
                  value={tier3Winners}
                  onChange={(e) => setTier3Winners(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-2 py-1 bg-theme-bg-tertiary border border-green-500/30 rounded text-theme-text-primary text-center"
                />
              </div>
            </div>
            <button
              onClick={() => onSettle(tier1Winners, tier2Winners, tier3Winners)}
              disabled={isLoading}
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Processing...' : 'Settle Round'}
            </button>
          </div>
        )}

        {round.status === ROUND_STATUS.SETTLED && (
          <div className="text-center text-theme-text-secondary text-sm py-2">Round completed</div>
        )}

        {round.status === ROUND_STATUS.OPEN && now < round.closeTime && (
          <div className="text-center text-theme-text-secondary text-sm py-2">
            Waiting for close time...
          </div>
        )}

        {round.status === ROUND_STATUS.CLOSED && now < round.drawTime && (
          <div className="text-center text-theme-text-secondary text-sm py-2">
            Waiting for draw time...
          </div>
        )}
      </div>
    </div>
  );
}
