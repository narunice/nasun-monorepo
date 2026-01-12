/**
 * BottomTabPanel Component
 * Tab-based panel for Positions, Open Orders, Order History, Trade History, Assets
 * Benchmark: Lighter, Asterdex, Hyperliquid common pattern
 */

import { useState } from 'react';
import { OpenOrders } from './OpenOrders';
import { TradeHistory } from './TradeHistory';
import { useOpenOrders, useOrderActions } from '../hooks';

export type TabType = 'openOrders' | 'orderHistory' | 'tradeHistory' | 'assets';

interface TabConfig {
  id: TabType;
  label: string;
  badge?: number;
}

interface BottomTabPanelProps {
  className?: string;
}

export function BottomTabPanel({ className = '' }: BottomTabPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('openOrders');
  const { balanceManagerId, isLoading, handleCancelOrder } = useOrderActions();
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const openOrderCount = openOrdersData?.orders?.length ?? 0;

  const tabs: TabConfig[] = [
    { id: 'openOrders', label: 'Open Orders', badge: openOrderCount > 0 ? openOrderCount : undefined },
    { id: 'orderHistory', label: 'Order History' },
    { id: 'tradeHistory', label: 'Trade History' },
    { id: 'assets', label: 'Assets' },
  ];

  return (
    <div className={`bg-theme-bg-secondary rounded-lg ${className}`}>
      {/* Tab Headers */}
      <div className="flex border-b border-theme-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-trading-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-theme-text-primary border-theme-accent'
                : 'text-theme-text-muted border-transparent hover:text-theme-text-secondary hover:border-theme-border'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-trading-xs font-bold rounded-full bg-theme-accent/20 text-theme-accent">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-3">
        {activeTab === 'openOrders' && (
          <OpenOrdersTab
            orders={openOrdersData?.orders ?? []}
            isLoading={isLoading}
            onCancel={handleCancelOrder}
          />
        )}
        {activeTab === 'orderHistory' && <OrderHistoryTab />}
        {activeTab === 'tradeHistory' && <TradeHistoryTab />}
        {activeTab === 'assets' && <AssetsTab />}
      </div>
    </div>
  );
}

// Open Orders Tab - reuses existing OpenOrders component
interface OpenOrdersTabProps {
  orders: Array<{ orderId: string; price: number; quantity: number; isBid: boolean; }>;
  isLoading: boolean;
  onCancel: (orderId: string) => void;
}

function OpenOrdersTab({ orders, isLoading, onCancel }: OpenOrdersTabProps) {
  return (
    <div className="min-h-[180px]">
      <OpenOrders orders={orders} isLoading={isLoading} onCancel={onCancel} />
    </div>
  );
}

// Order History Tab - shows completed/cancelled orders
function OrderHistoryTab() {
  return (
    <div className="min-h-[180px]">
      <div className="text-trading-xs text-theme-text-muted grid grid-cols-5 gap-2 mb-2 pb-2 border-b border-theme-border">
        <span>Time</span>
        <span>Type</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Status</span>
      </div>
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm">No order history available</p>
        <p className="text-trading-xs mt-1">Your completed and cancelled orders will appear here</p>
      </div>
    </div>
  );
}

// Trade History Tab - shows executed fills
function TradeHistoryTab() {
  return (
    <div className="min-h-[180px]">
      <TradeHistory />
    </div>
  );
}

// Assets Tab - shows user balances
function AssetsTab() {
  return (
    <div className="min-h-[180px]">
      <div className="text-trading-xs text-theme-text-muted grid grid-cols-4 gap-2 mb-2 pb-2 border-b border-theme-border">
        <span>Asset</span>
        <span className="text-right">Wallet</span>
        <span className="text-right">Trading</span>
        <span className="text-right">Total</span>
      </div>
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm">Connect wallet to view assets</p>
        <p className="text-trading-xs mt-1">Your balances will appear here</p>
      </div>
    </div>
  );
}
