/**
 * SlippageSettings Component
 * Market 주문용 슬리피지 허용 범위 설정
 */

import { useState } from 'react';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];

interface SlippageSettingsProps {
  value: number; // 0.5 = 0.5%
  onChange: (value: number) => void;
}

export function SlippageSettings({ value, onChange }: SlippageSettingsProps) {
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const handlePresetClick = (preset: number) => {
    setIsCustom(false);
    setCustomValue('');
    onChange(preset);
  };

  const handleCustomChange = (input: string) => {
    setCustomValue(input);
    const num = parseFloat(input);
    if (!isNaN(num) && num > 0 && num <= 50) {
      onChange(num);
    }
  };

  const handleCustomFocus = () => {
    setIsCustom(true);
  };

  const isPresetSelected = (preset: number) => !isCustom && value === preset;

  return (
    <div className="p-3 bg-theme-bg-tertiary/50 rounded">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs xl:text-sm text-theme-text-secondary">Slippage Tolerance</span>
        <span className="text-xs xl:text-sm font-mono text-blue-400">{value}%</span>
      </div>

      <div className="flex gap-1">
        {SLIPPAGE_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={`flex-1 py-1.5 text-xs xl:text-sm font-medium rounded transition-colors ${
              isPresetSelected(preset)
                ? 'bg-blue-600 text-white'
                : 'bg-theme-bg-secondary text-theme-text-primary hover:bg-theme-bg-tertiary'
            }`}
          >
            {preset}%
          </button>
        ))}
        <div className="flex-1 relative">
          <input
            type="number"
            placeholder="Custom"
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            onFocus={handleCustomFocus}
            className={`w-full py-1.5 px-2 text-xs font-medium rounded text-center transition-colors ${
              isCustom
                ? 'bg-blue-600 text-white placeholder-blue-200'
                : 'bg-theme-bg-secondary text-theme-text-primary placeholder-gray-400'
            } focus:outline-none`}
            min="0.01"
            max="50"
            step="0.1"
          />
          {isCustom && customValue && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs xl:text-sm text-blue-200">
              %
            </span>
          )}
        </div>
      </div>

      {value > 1 && (
        <p className="mt-2 text-[10px] xl:text-xs text-yellow-500">
          ⚠️ High slippage may result in unfavorable execution
        </p>
      )}
    </div>
  );
}
