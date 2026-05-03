/**
 * Leverage Slider Component
 * Allows selection of leverage from 1x to 20x
 */

import { useState, useCallback } from 'react';
import { MAX_LEVERAGE, MIN_LEVERAGE, LEVERAGE_OPTIONS } from '../constants';

interface LeverageSliderProps {
  value: number;
  onChange: (leverage: number) => void;
  disabled?: boolean;
  maxLeverage?: number;
}

export function LeverageSlider({
  value,
  onChange,
  disabled = false,
  maxLeverage = MAX_LEVERAGE,
}: LeverageSliderProps) {
  const [inputValue, setInputValue] = useState(value.toString());

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseInt(e.target.value, 10);
      setInputValue(newValue.toString());
      onChange(newValue);
    },
    [onChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setInputValue(raw);

      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= MIN_LEVERAGE && parsed <= maxLeverage) {
        onChange(parsed);
      }
    },
    [onChange, maxLeverage],
  );

  const handleInputBlur = useCallback(() => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < MIN_LEVERAGE) {
      setInputValue(MIN_LEVERAGE.toString());
      onChange(MIN_LEVERAGE);
    } else if (parsed > maxLeverage) {
      setInputValue(maxLeverage.toString());
      onChange(maxLeverage);
    }
  }, [inputValue, onChange, maxLeverage]);

  const handleQuickSelect = useCallback(
    (leverage: number) => {
      if (leverage <= maxLeverage) {
        setInputValue(leverage.toString());
        onChange(leverage);
      }
    },
    [onChange, maxLeverage],
  );

  // Calculate slider position percentage
  const percentage = ((value - MIN_LEVERAGE) / (maxLeverage - MIN_LEVERAGE)) * 100;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-theme-text-secondary">
          Leverage
        </label>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            disabled={disabled}
            className="w-12 px-2 py-1 text-right text-sm font-bold bg-theme-bg-secondary border border-theme-border rounded focus:outline-none focus:border-theme-primary disabled:opacity-50"
          />
          <span className="text-sm font-bold text-theme-text-primary">x</span>
        </div>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={MIN_LEVERAGE}
          max={maxLeverage}
          step={1}
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-full h-2 bg-theme-bg-tertiary rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: `linear-gradient(to right, rgb(var(--color-primary)) 0%, rgb(var(--color-primary)) ${percentage}%, rgb(var(--color-bg-tertiary)) ${percentage}%, rgb(var(--color-bg-tertiary)) 100%)`,
          }}
        />
        {/* Tick marks */}
        <div className="flex justify-between mt-1 px-0.5">
          {[1, 5, 10, 15, 20].map((tick) => (
            <div
              key={tick}
              className={`text-xs ${
                tick <= maxLeverage
                  ? 'text-theme-text-muted'
                  : 'text-theme-text-disabled'
              }`}
            >
              {tick}x
            </div>
          ))}
        </div>
      </div>

      {/* Quick select buttons */}
      <div className="flex gap-2">
        {LEVERAGE_OPTIONS.map((leverage) => (
          <button
            key={leverage}
            onClick={() => handleQuickSelect(leverage)}
            disabled={disabled || leverage > maxLeverage}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
              value === leverage
                ? 'bg-theme-primary text-white'
                : leverage <= maxLeverage
                  ? 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
                  : 'bg-theme-bg-secondary text-theme-text-disabled cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {leverage}x
          </button>
        ))}
      </div>

      {/* Risk warning */}
      {value >= 10 && (
        <div className="flex items-center gap-2 p-2 text-xs bg-yellow-500/25 border border-yellow-500/50 rounded">
          <span className="text-yellow-500">⚠</span>
          <span className="text-yellow-400">
            High leverage increases liquidation risk
          </span>
        </div>
      )}
    </div>
  );
}
