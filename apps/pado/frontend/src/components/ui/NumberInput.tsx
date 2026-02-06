/**
 * NumberInput
 * Styled number input with custom themed spinners
 * - Hides ugly default browser spinners
 * - Shows elegant up/down buttons on hover/focus
 * - Supports dark/light theme
 */

import { useRef, type InputHTMLAttributes } from 'react';

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Step value for increment/decrement (default: 1) */
  step?: number;
  /** Whether to show spinner buttons (default: true) */
  showSpinner?: boolean;
  /** Prefix symbol (e.g., "$") */
  prefix?: string;
  /** Suffix symbol (e.g., "BTC") */
  suffix?: string;
}

export function NumberInput({
  step = 1,
  showSpinner = true,
  prefix,
  suffix,
  className = '',
  disabled,
  value,
  onChange,
  ...props
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleIncrement = () => {
    if (disabled || !inputRef.current) return;
    const currentValue = parseFloat(inputRef.current.value) || 0;
    const decimalPlaces = String(step).split('.')[1]?.length || 0;
    const newValue = parseFloat((currentValue + step).toFixed(decimalPlaces));
    inputRef.current.value = String(newValue);
    const event = new Event('input', { bubbles: true });
    inputRef.current.dispatchEvent(event);
  };

  const handleDecrement = () => {
    if (disabled || !inputRef.current) return;
    const currentValue = parseFloat(inputRef.current.value) || 0;
    const decimalPlaces = String(step).split('.')[1]?.length || 0;
    const newValue = parseFloat(Math.max(0, currentValue - step).toFixed(decimalPlaces));
    inputRef.current.value = String(newValue);
    const event = new Event('input', { bubbles: true });
    inputRef.current.dispatchEvent(event);
  };

  return (
    <div className="number-input-wrapper w-full relative group">
      {prefix && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-theme-text-muted pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full bg-theme-bg-tertiary border border-theme-border rounded
          text-theme-text-primary placeholder:text-theme-text-muted
          focus:outline-none focus:border-pd1 focus:ring-1 focus:ring-pd1/30
          disabled:opacity-40 disabled:cursor-not-allowed
          ${prefix ? 'pl-6' : 'pl-2.5'}
          ${suffix ? 'pr-12' : showSpinner ? 'pr-8' : 'pr-2.5'}
          ${className}`}
        {...props}
      />
      {suffix && (
        <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-theme-text-muted pointer-events-none">
          {suffix}
        </span>
      )}
      {showSpinner && (
        <div className="number-spinner">
          <button
            type="button"
            onClick={handleIncrement}
            disabled={disabled}
            tabIndex={-1}
            aria-label="Increment"
          >
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6.5L5 3.5L8 6.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDecrement}
            disabled={disabled}
            tabIndex={-1}
            aria-label="Decrement"
          >
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3.5L5 6.5L8 3.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
