/**
 * Perpetual Trading Panel Container
 * Main orchestrator for the perp trading interface
 */

import { useState, useCallback } from 'react';
import { PerpMarketProvider, usePerpMarketContext } from '../context/PerpMarketContext';
import { PerpOrderForm } from '../components/PerpOrderForm';
import { PerpPositionList } from '../components/PerpPositionList';
import { PerpMarketInfo } from '../components/PerpMarketInfo';
import { PERP_MARKET_BTC } from '../constants';

interface PerpTradingPanelProps {
  defaultMarketId?: string;
}

export function PerpTradingPanel({
  defaultMarketId = PERP_MARKET_BTC,
}: PerpTradingPanelProps) {
  return (
    <PerpMarketProvider defaultMarketId={defaultMarketId}>
      <PerpTradingPanelInner />
    </PerpMarketProvider>
  );
}

function PerpTradingPanelInner() {
  const [activeTab, setActiveTab] = useState<'order' | 'positions'>('order');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const { selectedMarket, error: marketError } = usePerpMarketContext();

  // Handle order success
  const handleOrderSuccess = useCallback((txDigest: string) => {
    setNotification({
      type: 'success',
      message: `Position opened! TX: ${txDigest.slice(0, 8)}...`,
    });
    setActiveTab('positions');
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Handle order error
  const handleOrderError = useCallback((error: Error) => {
    setNotification({
      type: 'error',
      message: error.message,
    });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Handle close success
  const handleCloseSuccess = useCallback((txDigest: string) => {
    setNotification({
      type: 'success',
      message: `Position closed! TX: ${txDigest.slice(0, 8)}...`,
    });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Handle close error
  const handleCloseError = useCallback((error: Error) => {
    setNotification({
      type: 'error',
      message: error.message,
    });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  // Show error if market not found
  if (marketError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 mb-2">Error loading market</p>
        <p className="text-sm text-theme-text-muted">{marketError.message}</p>
      </div>
    );
  }

  // Show message if no market configured
  if (!selectedMarket && !PERP_MARKET_BTC) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Perpetual Trading</h2>
        <p className="text-theme-text-muted mb-4">
          No perpetual markets available yet.
        </p>
        <p className="text-sm text-theme-text-disabled">
          Markets will be available after the BTC-PERP market is created.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Notification */}
      {notification && (
        <div
          className={`p-3 rounded-lg ${
            notification.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Market Info */}
      <PerpMarketInfo />

      {/* Tabs */}
      <div className="flex border-b border-theme-border">
        <button
          onClick={() => setActiveTab('order')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'order'
              ? 'border-theme-primary text-theme-primary'
              : 'border-transparent text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          Trade
        </button>
        <button
          onClick={() => setActiveTab('positions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'positions'
              ? 'border-theme-primary text-theme-primary'
              : 'border-transparent text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          Positions
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-theme-bg-primary rounded-lg p-4">
        {activeTab === 'order' ? (
          <PerpOrderForm
            onOrderSuccess={handleOrderSuccess}
            onOrderError={handleOrderError}
          />
        ) : (
          <PerpPositionList
            onCloseSuccess={handleCloseSuccess}
            onCloseError={handleCloseError}
          />
        )}
      </div>
    </div>
  );
}
