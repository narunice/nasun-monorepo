/**
 * PriceAlertPopover
 *
 * Dropdown popover for creating and managing price alerts.
 * Accessed via bell icon in ChartHeader.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PriceAlert } from '../lib/price-alert-types';

interface PriceAlertPopoverProps {
  alerts: PriceAlert[];
  activeAlerts: PriceAlert[];
  currentPrice: number;
  symbol: string;
  onAddAlert: (alert: Omit<PriceAlert, 'id' | 'status' | 'createdAt'>) => PriceAlert | null;
  onCancelAlert: (id: string) => void;
  onRemoveAlert: (id: string) => void;
  onClearHistory: () => void;
}

export function PriceAlertPopover({
  alerts,
  activeAlerts,
  currentPrice,
  symbol,
  onAddAlert,
  onCancelAlert,
  onRemoveAlert,
  onClearHistory,
}: PriceAlertPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Pre-fill with current price when opening
  useEffect(() => {
    if (isOpen && currentPrice > 0) {
      setTargetPrice(currentPrice.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Click outside to close
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  const handleSubmit = () => {
    const price = parseFloat(targetPrice);
    if (!Number.isFinite(price) || price <= 0) return;

    const result = onAddAlert({ symbol, targetPrice: price, direction });
    if (result) {
      setTargetPrice('');
      setIsOpen(false);
    }
  };

  const historyAlerts = alerts.filter((a) => a.status !== 'active');

  const formatPrice = (price: number) =>
    `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
          isOpen
            ? 'bg-orange-600 text-white'
            : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
        }`}
        title="Price Alerts"
        aria-label="Price Alerts"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {activeAlerts.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full text-[9px] text-white flex items-center justify-center leading-none">
            {activeAlerts.length}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50">
          {/* Create Alert Form */}
          <div className="p-3 border-b border-theme-border">
            <p className="text-xs font-medium text-theme-text-muted mb-2">New Price Alert</p>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Target price"
                step="0.01"
                className="flex-1 px-2 py-1.5 text-sm bg-theme-bg-primary border border-theme-border rounded font-mono text-theme-text-primary focus:outline-none focus:border-pd3"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection('above')}
                className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                  direction === 'above'
                    ? 'bg-green-600/20 text-green-400 border border-green-600/40'
                    : 'text-theme-text-muted border border-theme-border hover:border-theme-text-muted'
                }`}
              >
                Above
              </button>
              <button
                onClick={() => setDirection('below')}
                className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                  direction === 'below'
                    ? 'bg-red-600/20 text-red-400 border border-red-600/40'
                    : 'text-theme-text-muted border border-theme-border hover:border-theme-text-muted'
                }`}
              >
                Below
              </button>
              <button
                onClick={handleSubmit}
                className="px-3 py-1 text-xs rounded bg-orange-600 text-white hover:bg-orange-500 transition-colors"
              >
                Set
              </button>
            </div>
          </div>

          {/* Active Alerts */}
          <div className="max-h-48 overflow-y-auto">
            {activeAlerts.length > 0 ? (
              <div className="p-2">
                <p className="text-[10px] font-medium text-theme-text-muted mb-1">Active ({activeAlerts.length})</p>
                {activeAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between py-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={alert.direction === 'above' ? 'text-green-400' : 'text-red-400'}>
                        {alert.direction === 'above' ? '\u2191' : '\u2193'}
                      </span>
                      <span className="font-mono text-theme-text-primary">{formatPrice(alert.targetPrice)}</span>
                    </div>
                    <button
                      onClick={() => onCancelAlert(alert.id)}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-theme-text-muted text-xs">
                No active alerts
              </div>
            )}
          </div>

          {/* History */}
          {historyAlerts.length > 0 && (
            <div className="border-t border-theme-border p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-theme-text-muted">History</span>
                <button
                  onClick={onClearHistory}
                  className="text-[10px] text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                >
                  Clear
                </button>
              </div>
              {historyAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between py-0.5 text-[10px] text-theme-text-muted">
                  <div className="flex items-center gap-1">
                    <span className={alert.status === 'triggered' ? 'text-orange-400' : ''}>
                      {alert.direction === 'above' ? '\u2191' : '\u2193'} {formatPrice(alert.targetPrice)}
                    </span>
                    <span className={alert.status === 'triggered' ? 'text-green-400' : 'text-theme-text-muted'}>
                      {alert.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {alert.triggeredAt && <span>{formatTime(alert.triggeredAt)}</span>}
                    <button
                      onClick={() => onRemoveAlert(alert.id)}
                      className="text-theme-text-muted hover:text-red-400 transition-colors"
                      aria-label="Remove alert"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
