/**
 * ChartContextMenu — Right-click context menu for chart-to-order flow.
 * Shows "Buy Limit @ price" and "Sell Limit @ price" options.
 * Disabled on touch devices to avoid conflict with chart pan/zoom.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ChartContextMenuProps {
  x: number;
  y: number;
  price: number;
  onBuyLimit: (price: number) => void;
  onSellLimit: (price: number) => void;
  onClose: () => void;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

export function ChartContextMenu({ x, y, price, onBuyLimit, onSellLimit, onClose }: ChartContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click/touch outside or Escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = ('touches' in e) ? e.touches[0]?.target : e.target;
      if (menuRef.current && target && !menuRef.current.contains(target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const formatted = formatPrice(price);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => { onBuyLimit(price); onClose(); }}
        className="w-full px-3 py-2 text-left text-sm hover:bg-theme-bg-tertiary active:bg-theme-bg-tertiary transition-colors flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span>Buy Limit @ <span className="font-mono">{formatted}</span></span>
      </button>
      <button
        onClick={() => { onSellLimit(price); onClose(); }}
        className="w-full px-3 py-2 text-left text-sm hover:bg-theme-bg-tertiary active:bg-theme-bg-tertiary transition-colors flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span>Sell Limit @ <span className="font-mono">{formatted}</span></span>
      </button>
    </div>,
    document.body,
  );
}

/** Check if the device supports touch (used to disable context menu on mobile) */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
