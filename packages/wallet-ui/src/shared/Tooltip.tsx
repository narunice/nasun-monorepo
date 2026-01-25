/**
 * Tooltip Component
 *
 * Provides contextual help via [?] icon with hover tooltip.
 * Used for explaining technical terms in a user-friendly way.
 *
 * UX Principle: Contextual help reduces uncertainty without cluttering UI
 */

import { useState, useRef, useEffect } from 'react';

export interface TooltipProps {
  /** Tooltip content text */
  content: string;
  /** Optional title for the tooltip */
  title?: string;
  /** Icon variant */
  variant?: 'help' | 'info';
  /** Size of the trigger icon */
  size?: 'xs' | 'sm' | 'md';
  /** Position of the tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Additional class names */
  className?: string;
}

const SIZE_STYLES = {
  xs: 'w-3 h-3 text-[10px]',
  sm: 'w-4 h-4 text-xs',
  md: 'w-5 h-5 text-sm',
};

const POSITION_STYLES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW_STYLES = {
  top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
};

/**
 * Tooltip with contextual help icon
 *
 * @example
 * <Tooltip content="Network fee for processing this transaction" />
 * <Tooltip
 *   title="What is Nonce?"
 *   content="A unique number that prevents transaction replay"
 *   variant="help"
 * />
 */
export function Tooltip({
  content,
  title,
  variant = 'help',
  size = 'sm',
  position = 'top',
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Auto-adjust position if tooltip would overflow viewport
  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const padding = 8;

    let newPosition = position;

    // Check overflow and adjust
    if (position === 'top' && triggerRect.top - tooltipRect.height < padding) {
      newPosition = 'bottom';
    } else if (position === 'bottom' && triggerRect.bottom + tooltipRect.height > window.innerHeight - padding) {
      newPosition = 'top';
    } else if (position === 'left' && triggerRect.left - tooltipRect.width < padding) {
      newPosition = 'right';
    } else if (position === 'right' && triggerRect.right + tooltipRect.width > window.innerWidth - padding) {
      newPosition = 'left';
    }

    if (newPosition !== adjustedPosition) {
      setAdjustedPosition(newPosition);
    }
  }, [isVisible, position, adjustedPosition]);

  const handleMouseEnter = () => setIsVisible(true);
  const handleMouseLeave = () => setIsVisible(false);
  const handleFocus = () => setIsVisible(true);
  const handleBlur = () => setIsVisible(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`
          inline-flex items-center justify-center rounded-full
          ${SIZE_STYLES[size]}
          ${variant === 'help'
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
            : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
          }
          transition-colors cursor-help focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
        `}
        aria-label="Help"
      >
        {variant === 'help' ? '?' : 'i'}
      </button>

      {/* Tooltip content */}
      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`
            absolute z-50 px-3 py-2 max-w-xs
            bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg
            ${POSITION_STYLES[adjustedPosition]}
            animate-fade-in
          `}
        >
          {title && (
            <div className="font-medium mb-1 text-gray-100">{title}</div>
          )}
          <div className="text-gray-300 leading-relaxed">{content}</div>

          {/* Arrow */}
          <span
            className={`
              absolute w-0 h-0 border-4 border-gray-900 dark:border-gray-800
              ${ARROW_STYLES[adjustedPosition]}
            `}
          />
        </div>
      )}
    </span>
  );
}

/**
 * Inline tooltip that wraps any content with a tooltip
 */
export interface InlineTooltipProps {
  /** Content to wrap */
  children: React.ReactNode;
  /** Tooltip text */
  tooltip: string;
  /** Position of the tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InlineTooltip({
  children,
  tooltip,
  position = 'top',
}: InlineTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span
          role="tooltip"
          className={`
            absolute z-50 px-2 py-1 whitespace-nowrap
            bg-gray-900 dark:bg-gray-800 text-white text-xs rounded shadow-lg
            ${POSITION_STYLES[position]}
          `}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
