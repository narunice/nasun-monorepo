/**
 * BottomTabPanel Component
 * Tab-based panel for Open Orders, Order History, Trade History, Assets
 * All tabs show personal data (wallet required)
 * Benchmark: Lighter, Hyperliquid, Binance common pattern
 */

import { useState, useEffect } from 'react';
import { useWallet, useZkLogin, useMultiBalance, usePasskeyStore } from '@nasun/wallet';
import { OpenOrders } from './OpenOrders';
import { OrderHistory } from './OrderHistory';
import { TradeHistory } from './TradeHistory';
import { useOpenOrders, useOrderActions, useBalanceManagerBalance } from '../hooks';
import { useMarket } from '../context/MarketContext';
import { calcLockedAmounts } from '../types';
import { UnderlineTabs, type TabItem } from '@/components/common';
import { TransferModal } from './TransferModal';
import { getActiveTPSLOrders, getTPSLOrders, cancelTPSLOrder, removeTPSLOrder, clearTPSLHistory } from '../lib/tpsl-storage';
import { TPSL_POLL_INTERVAL_MS } from '../lib/tpsl-types';
import type { TPSLOrder } from '../lib/tpsl-types';
import { MiniPortfolioWidget } from '../../portfolio/components/MiniPortfolioWidget';

export type TabType = 'openOrders' | 'tpsl' | 'orderHistory' | 'tradeHistory' | 'assets' | 'portfolio';

type TabConfig = TabItem<TabType>;

interface BottomTabPanelProps {
  className?: string;
}

export function BottomTabPanel({ className = '' }: BottomTabPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('openOrders');
  const { balanceManagerId, isLoading, handleCancelOrder, handleCancelAllOrders } = useOrderActions();
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const openOrderCount = openOrdersData?.orders?.length ?? 0;

  // Periodic refresh instead of reading localStorage on every render
  const [tpslActiveCount, setTpslActiveCount] = useState(() => getActiveTPSLOrders().length);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTpslActiveCount(getActiveTPSLOrders().length);
    }, TPSL_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const tabs: TabConfig[] = [
    { id: 'openOrders', label: 'Open Orders', badge: openOrderCount > 0 ? openOrderCount : undefined },
    { id: 'tpsl', label: 'TP/SL', badge: tpslActiveCount > 0 ? tpslActiveCount : undefined },
    { id: 'orderHistory', label: 'Order History' },
    { id: 'tradeHistory', label: 'Trade History' },
    { id: 'assets', label: 'Assets' },
    { id: 'portfolio', label: 'Portfolio' },
  ];

  return (
    <div className={`bg-theme-bg-secondary rounded-lg flex flex-col border border-[var(--color-panel-border)] shadow-panel ${className}`}>
      {/* Tab Headers */}
      <div className="shrink-0">
        <UnderlineTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Tab Content */}
      <div className="p-3 flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'openOrders' && (
          <OpenOrdersTab
            orders={openOrdersData?.orders ?? []}
            isLoading={isLoading}
            onCancel={handleCancelOrder}
            onCancelAll={handleCancelAllOrders}
          />
        )}
        {activeTab === 'tpsl' && <TPSLTab />}
        {activeTab === 'orderHistory' && <OrderHistoryTab />}
        {activeTab === 'tradeHistory' && <TradeHistoryTab />}
        {activeTab === 'assets' && <AssetsTab />}
        {activeTab === 'portfolio' && <MiniPortfolioWidget />}
      </div>
    </div>
  );
}

// Open Orders Tab - reuses existing OpenOrders component
interface OpenOrdersTabProps {
  orders: Array<{ orderId: string; price: number; quantity: number; isBid: boolean; }>;
  isLoading: boolean;
  onCancel: (orderId: string) => void;
  onCancelAll: (orderIds: string[]) => void;
}

function OpenOrdersTab({ orders, isLoading, onCancel, onCancelAll }: OpenOrdersTabProps) {
  return (
    <div className="min-h-[180px]">
      <OpenOrders orders={orders} isLoading={isLoading} onCancel={onCancel} onCancelAll={onCancelAll} />
    </div>
  );
}

// Order History Tab - shows personal order lifecycle (limit + market)
function OrderHistoryTab() {
  return (
    <div className="min-h-[180px]">
      <OrderHistory />
    </div>
  );
}

// Trade History Tab - shows personal trade fills (1 fill = 1 row)
function TradeHistoryTab() {
  return (
    <div className="min-h-[180px]">
      <TradeHistory />
    </div>
  );
}

// TP/SL Tab - shows active and triggered TP/SL orders
const TPSL_HISTORY_PAGE_SIZE = 20;

function TPSLTab() {
  const [orders, setOrders] = useState<TPSLOrder[]>(() => getTPSLOrders());
  const [historyVisible, setHistoryVisible] = useState(TPSL_HISTORY_PAGE_SIZE);

  const refresh = () => setOrders(getTPSLOrders());

  const handleCancel = (id: string) => {
    cancelTPSLOrder(id);
    refresh();
  };

  const handleRemove = (id: string) => {
    removeTPSLOrder(id);
    refresh();
  };

  const handleClearHistory = () => {
    clearTPSLHistory();
    setHistoryVisible(TPSL_HISTORY_PAGE_SIZE);
    refresh();
  };

  const activeOrders = orders.filter((o) => o.status === 'active');
  const historyOrders = orders.filter((o) => o.status !== 'active');

  const formatPrice = (price: number) =>
    `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  const statusColor = (status: string) => {
    switch (status) {
      case 'triggered': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'cancelled': return 'text-theme-text-muted';
      default: return 'text-theme-text-primary';
    }
  };

  const typeLabel = (type: TPSLOrder['triggerType']) => {
    switch (type) {
      case 'tp': return 'TP';
      case 'stop-limit': return 'S-L';
      case 'trailing-stop': return 'Trail';
      default: return 'SL';
    }
  };

  const typeColor = (type: TPSLOrder['triggerType'], dim = false) => {
    const opacity = dim ? '/60' : '';
    switch (type) {
      case 'tp': return `text-green-400${opacity}`;
      case 'stop-limit': return `text-amber-400${opacity}`;
      case 'trailing-stop': return `text-purple-400${opacity}`;
      default: return `text-red-400${opacity}`;
    }
  };

  const typeBadgeColor = (type: TPSLOrder['triggerType']) => {
    switch (type) {
      case 'tp': return 'bg-green-600/20 text-green-400';
      case 'stop-limit': return 'bg-amber-600/20 text-amber-400';
      case 'trailing-stop': return 'bg-purple-600/20 text-purple-400';
      default: return 'bg-red-600/20 text-red-400';
    }
  };

  // Render trigger info based on order type
  const renderTrigger = (order: TPSLOrder) => {
    if (order.triggerType === 'trailing-stop') {
      const trailLabel = order.trailPercent
        ? `Trail ${order.trailPercent}%`
        : order.trailAmount
          ? `Trail ${formatPrice(order.trailAmount)}`
          : formatPrice(order.triggerPrice);
      return (
        <div className="text-right font-mono">
          <div>{trailLabel}</div>
          {order.highWaterMark ? (
            <div className="text-theme-text-muted text-[10px]">HWM {formatPrice(order.highWaterMark)}</div>
          ) : null}
        </div>
      );
    }
    if (order.triggerType === 'stop-limit') {
      return (
        <div className="text-right font-mono">
          <div>{formatPrice(order.triggerPrice)}</div>
          {order.limitPrice ? (
            <div className="text-theme-text-muted text-[10px]">Limit {formatPrice(order.limitPrice)}</div>
          ) : null}
        </div>
      );
    }
    return <span className="text-right font-mono">{formatPrice(order.triggerPrice)}</span>;
  };

  return (
    <div className="min-h-[180px]">
      {/* Active TP/SL Orders */}
      {activeOrders.length > 0 ? (
        <>
          <div className="text-trading-xs xl:text-trading-sm text-theme-text-muted grid grid-cols-5 xl:grid-cols-6 gap-2 mb-2 pb-1 border-b border-theme-border">
            <span>Type</span>
            <span>Side</span>
            <span className="text-right">Trigger</span>
            <span className="text-right">Qty</span>
            <span className="text-right hidden xl:block">Created</span>
            <span className="text-right">Action</span>
          </div>
          {activeOrders.map((order) => (
            <div key={order.id} className="grid grid-cols-5 xl:grid-cols-6 gap-2 py-1 text-trading-sm xl:text-trading-lg items-center">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] xl:text-xs font-medium ${typeBadgeColor(order.triggerType)}`}>
                {typeLabel(order.triggerType)}
              </span>
              <span className={order.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                {order.side === 'buy' ? 'Buy' : 'Sell'}
              </span>
              {renderTrigger(order)}
              <span className="text-right font-mono">{order.quantity.toFixed(4)}</span>
              <span className="text-right text-theme-text-muted text-[10px] hidden xl:block">{formatTime(order.createdAt)}</span>
              <div className="text-right">
                <button
                  onClick={() => handleCancel(order.id)}
                  className="px-3 min-h-[44px] md:min-h-0 md:px-1.5 md:py-0.5 text-trading-xs font-medium rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="text-center text-theme-text-muted py-6">
          <p className="text-trading-sm xl:text-trading-lg">No active TP/SL orders</p>
          <p className="text-trading-xs xl:text-trading-sm mt-1">Set TP/SL in the order form</p>
        </div>
      )}

      {/* History */}
      {historyOrders.length > 0 && (
        <div className="mt-3 pt-2 border-t border-theme-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-trading-xs text-theme-text-muted">History</span>
            <button
              onClick={handleClearHistory}
              className="text-[10px] text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Clear
            </button>
          </div>
          {historyOrders.slice(0, historyVisible).map((order) => (
            <div key={order.id} className="grid grid-cols-6 gap-2 py-0.5 text-[10px] xl:text-xs text-theme-text-muted items-center">
              <span className={typeColor(order.triggerType, true)}>
                {typeLabel(order.triggerType)}
              </span>
              <span>{order.side === 'buy' ? 'Buy' : 'Sell'}</span>
              <span className="text-right font-mono">{formatPrice(order.triggerPrice)}</span>
              <span className="text-right font-mono">{order.quantity.toFixed(4)}</span>
              <span className={`text-right ${statusColor(order.status)}`}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
              <div className="text-right">
                <button
                  onClick={() => handleRemove(order.id)}
                  className="text-theme-text-muted hover:text-red-400 transition-colors"
                >
                  x
                </button>
              </div>
            </div>
          ))}
          {historyOrders.length > historyVisible && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => setHistoryVisible((v) => v + TPSL_HISTORY_PAGE_SIZE)}
                className="text-[10px] xl:text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
              >
                Show {Math.min(TPSL_HISTORY_PAGE_SIZE, historyOrders.length - historyVisible)} more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Assets Tab - shows user balances with Deposit/Withdraw actions
function AssetsTab() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked;

  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;

  const { balanceManagerId, isLoading, handleDepositToken, handleWithdrawToken, lastAutoDepositError } = useOrderActions();
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const assetOrders = openOrdersData?.orders ?? [];
  const { balance: bmBalanceData } = useBalanceManagerBalance({ balanceManagerId });
  const bmBalance = bmBalanceData ?? { base: 0, quote: 0 };
  const { lockedQuote, lockedBase } = calcLockedAmounts(assetOrders);

  const { data: multiBalance } = useMultiBalance();
  const walletBase = parseFloat(multiBalance?.tokens[baseSymbol]?.formatted ?? '0');
  const walletQuote = parseFloat(multiBalance?.tokens['NUSDC']?.formatted ?? '0');

  // Must be called before any conditional returns (Rules of Hooks)
  const [modalState, setModalState] = useState<{
    action: 'deposit' | 'withdraw';
    tokenSymbol: string;
    tokenType: string;
    tokenDecimals: number;
    availableBalance: number;
  } | null>(null);

  if (!isConnected) {
    return (
      <div className="min-h-[180px]">
        <div className="text-trading-xs xl:text-trading-sm text-theme-text-muted grid grid-cols-6 gap-2 mb-2 pb-2 border-b border-theme-border">
          <span>Asset</span>
          <span className="text-right">Wallet</span>
          <span className="text-right">Trading</span>
          <span className="text-right">In Orders</span>
          <span className="text-right">Total</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="text-center text-theme-text-muted py-6">
          <p className="text-trading-sm xl:text-trading-lg">Connect wallet to view assets</p>
          <p className="text-trading-xs xl:text-trading-sm mt-1">Your balances will appear here</p>
        </div>
      </div>
    );
  }

  const assets = [
    {
      symbol: baseSymbol,
      wallet: walletBase,
      trading: bmBalance.base,
      inOrders: lockedBase,
      decimals: 4,
      tokenType: currentPool.baseToken.type!,
      tokenDecimals: currentPool.baseToken.decimals,
    },
    {
      symbol: 'NUSDC',
      wallet: walletQuote,
      trading: bmBalance.quote,
      inOrders: lockedQuote,
      decimals: 2,
      tokenType: currentPool.quoteToken.type!,
      tokenDecimals: currentPool.quoteToken.decimals,
    },
  ];

  return (
    <div className="min-h-[180px]">
      {/* Column Headers */}
      <div className="text-trading-xs xl:text-trading-sm text-theme-text-muted grid grid-cols-6 gap-2 mb-2 pb-2 border-b border-theme-border">
        <span>Asset</span>
        <span className="text-right">Wallet</span>
        <span className="text-right">Trading</span>
        <span className="text-right">In Orders</span>
        <span className="text-right">Total</span>
        <span className="text-right">Actions</span>
      </div>

      {/* Asset Rows */}
      {assets.map((asset) => (
        <div key={asset.symbol} className="grid grid-cols-6 gap-2 py-1.5 text-trading-sm xl:text-trading-lg">
          <span className="font-medium text-theme-text-primary">{asset.symbol}</span>
          <span className="text-right font-mono text-theme-text-secondary">
            {asset.wallet.toFixed(asset.decimals)}
          </span>
          <span className="text-right font-mono text-pd3">
            {asset.trading.toFixed(asset.decimals)}
          </span>
          <span className="text-right font-mono text-yellow-500">
            {asset.inOrders > 0 ? asset.inOrders.toFixed(asset.decimals) : '-'}
          </span>
          <span className="text-right font-mono text-theme-text-primary">
            {(asset.wallet + asset.trading).toFixed(asset.decimals)}
          </span>
          <div className="flex justify-end gap-1">
            {balanceManagerId && (
              <>
                <button
                  onClick={() => setModalState({
                    action: 'deposit',
                    tokenSymbol: asset.symbol,
                    tokenType: asset.tokenType,
                    tokenDecimals: asset.tokenDecimals,
                    availableBalance: asset.wallet,
                  })}
                  disabled={isLoading}
                  className="px-1.5 py-0.5 text-trading-xs xl:text-trading-sm font-medium rounded bg-pd1/20 text-pd3 hover:bg-pd1/30 disabled:opacity-50 transition-colors"
                >
                  Deposit
                </button>
                <button
                  onClick={() => setModalState({
                    action: 'withdraw',
                    tokenSymbol: asset.symbol,
                    tokenType: asset.tokenType,
                    tokenDecimals: asset.tokenDecimals,
                    availableBalance: asset.trading,
                  })}
                  disabled={isLoading}
                  className="px-1.5 py-0.5 text-trading-xs xl:text-trading-sm font-medium rounded bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 disabled:opacity-50 transition-colors"
                >
                  Withdraw
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Auto Deposit Error */}
      {lastAutoDepositError && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs xl:text-sm text-red-400">Auto deposit failed: {lastAutoDepositError}</p>
        </div>
      )}

      {/* Auto-deposit hint when trading balance is empty but wallet has tokens */}
      {balanceManagerId && bmBalance.quote === 0 && bmBalance.base === 0 && (walletQuote > 0 || walletBase > 0) && (
        <div className="mt-3 p-2.5 bg-pd1/5 border border-pd1/20 rounded-lg">
          <p className="text-trading-xs xl:text-trading-sm text-theme-text-secondary">
            Your wallet funds will be auto-deposited to your trading balance when you place an order.
          </p>
        </div>
      )}

      {/* Enable Pado hint */}
      {!balanceManagerId && (
        <div className="mt-3 text-center">
          <p className="text-trading-xs xl:text-trading-sm text-theme-text-muted">
            Enable Pado from the order form to deposit funds for trading
          </p>
        </div>
      )}

      {/* Per-token Transfer Modal */}
      {modalState && (
        <TransferModal
          onClose={() => setModalState(null)}
          action={modalState.action}
          tokenSymbol={modalState.tokenSymbol}
          tokenType={modalState.tokenType}
          tokenDecimals={modalState.tokenDecimals}
          availableBalance={modalState.availableBalance}
          isLoading={isLoading}
          onConfirm={modalState.action === 'deposit' ? handleDepositToken : handleWithdrawToken}
        />
      )}
    </div>
  );
}
