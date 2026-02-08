/**
 * TPSLInputs - Take Profit / Stop Loss input section
 *
 * Collapsible TP/SL price inputs that appear in the order form.
 * Provides percentage shortcuts relative to current price.
 */

import { useCallback, useMemo } from 'react';
import { NumberInput } from '@/components/ui/NumberInput';

interface TPSLInputsProps {
  /** Whether TP/SL is enabled */
  enabled: boolean;
  /** Toggle TP/SL on/off */
  onToggle: (enabled: boolean) => void;
  /** Take Profit price (string for input binding) */
  tpPrice: string;
  /** Stop Loss price (string for input binding) */
  slPrice: string;
  /** Set Take Profit price */
  onTPChange: (value: string) => void;
  /** Set Stop Loss price */
  onSLChange: (value: string) => void;
  /** Current mid price for percentage calculations */
  midPrice: number;
  /** Order side - determines TP/SL direction */
  side: 'buy' | 'sell';
  /** Minimum price tick for step input */
  minPriceTick?: number;
}

const TP_PRESETS = [1, 2, 5];
const SL_PRESETS = [1, 2, 5];

export function TPSLInputs({
  enabled,
  onToggle,
  tpPrice,
  slPrice,
  onTPChange,
  onSLChange,
  midPrice,
  side,
  minPriceTick = 0.1,
}: TPSLInputsProps) {
  const isBuy = side === 'buy';

  // For a buy order (long position): TP is above, SL is below
  // For a sell order (short position): TP is below, SL is above
  const tpDirection = isBuy ? 1 : -1;
  const slDirection = isBuy ? -1 : 1;

  const applyPercent = useCallback(
    (pct: number, direction: number): string => {
      if (midPrice <= 0) return '';
      const result = midPrice * (1 + (direction * pct) / 100);
      return result.toFixed(2);
    },
    [midPrice]
  );

  // Validation messages
  const tpValidation = useMemo(() => {
    const tp = parseFloat(tpPrice);
    if (!tpPrice || isNaN(tp)) return null;
    if (midPrice <= 0) return null;
    if (isBuy && tp <= midPrice) return 'TP must be above current price';
    if (!isBuy && tp >= midPrice) return 'TP must be below current price';
    return null;
  }, [tpPrice, midPrice, isBuy]);

  const slValidation = useMemo(() => {
    const sl = parseFloat(slPrice);
    if (!slPrice || isNaN(sl)) return null;
    if (midPrice <= 0) return null;
    if (isBuy && sl >= midPrice) return 'SL must be below current price';
    if (!isBuy && sl <= midPrice) return 'SL must be above current price';
    return null;
  }, [slPrice, midPrice, isBuy]);

  return (
    <div className="space-y-1.5">
      {/* Toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-theme-border text-pd1 focus:ring-pd1/30 bg-theme-bg-tertiary cursor-pointer"
        />
        <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted font-medium">
          TP/SL
        </span>
        {enabled && (
          <span className="text-[10px] text-theme-text-muted">
            (triggers market order)
          </span>
        )}
      </label>

      {/* TP/SL Inputs (shown when enabled) */}
      {enabled && (
        <div className="space-y-2 pl-0.5">
          {/* Take Profit */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-trading-xs xl:text-trading-sm text-green-500 dark:text-green-400 font-medium">
                Take Profit
              </label>
              <div className="flex items-center gap-0.5">
                {TP_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => onTPChange(applyPercent(pct, tpDirection))}
                    disabled={midPrice <= 0}
                    className="px-1 py-0.5 text-[10px] xl:text-xs rounded bg-theme-bg-tertiary text-theme-text-muted hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-30"
                  >
                    {tpDirection > 0 ? '+' : '-'}{pct}%
                  </button>
                ))}
              </div>
            </div>
            <NumberInput
              placeholder={midPrice > 0 ? `e.g. ${applyPercent(2, tpDirection)}` : '0.00'}
              value={tpPrice}
              onChange={(e) => onTPChange(e.target.value)}
              step={minPriceTick}
              prefix="$"
              className={`px-3 py-1.5 text-sm ${
                tpValidation ? 'ring-1 ring-yellow-500/50' : ''
              }`}
            />
            {tpValidation && (
              <p className="text-[10px] text-yellow-400 mt-0.5">{tpValidation}</p>
            )}
          </div>

          {/* Stop Loss */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-trading-xs xl:text-trading-sm text-red-500 dark:text-red-400 font-medium">
                Stop Loss
              </label>
              <div className="flex items-center gap-0.5">
                {SL_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => onSLChange(applyPercent(pct, slDirection))}
                    disabled={midPrice <= 0}
                    className="px-1 py-0.5 text-[10px] xl:text-xs rounded bg-theme-bg-tertiary text-theme-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                  >
                    {slDirection > 0 ? '+' : '-'}{pct}%
                  </button>
                ))}
              </div>
            </div>
            <NumberInput
              placeholder={midPrice > 0 ? `e.g. ${applyPercent(2, slDirection)}` : '0.00'}
              value={slPrice}
              onChange={(e) => onSLChange(e.target.value)}
              step={minPriceTick}
              prefix="$"
              className={`px-3 py-1.5 text-sm ${
                slValidation ? 'ring-1 ring-yellow-500/50' : ''
              }`}
            />
            {slValidation && (
              <p className="text-[10px] text-yellow-400 mt-0.5">{slValidation}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
