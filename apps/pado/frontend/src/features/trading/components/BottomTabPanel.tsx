/**
 * BottomTabPanel Component
 * Tab-based panel for Open Orders, Order History, Trade History, Assets
 * All tabs show personal data (wallet required)
 * Benchmark: Lighter, Hyperliquid, Binance common pattern
 */

import { useState } from 'react';
import { useWallet, useZkLogin, useMultiBalance } from '@nasun/wallet';
import { OpenOrders } from './OpenOrders';
import { OrderHistory } from './OrderHistory';
import { TradeHistory } from './TradeHistory';
import { DepthChart } from './chart';
import { useOpenOrders, useOrderActions, useOrderbook } from '../hooks';
import { useMarket } from '../context/MarketContext';
import { calcLockedAmounts } from '../types';
import { UnderlineTabs, type TabItem } from '@/components/common';
import { TransferModal } from './TransferModal';

export type TabType = 'openOrders' | 'orderHistory' | 'tradeHistory' | 'depth' | 'assets';

type TabConfig = TabItem<TabType>;

interface BottomTabPanelProps {
  className?: string;
}

export function BottomTabPanel({ className = '' }: BottomTabPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('openOrders');
  const { balanceManagerId, isLoading, handleCancelOrder, handleCancelAllOrders } = useOrderActions();
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const { data: orderbookData } = useOrderbook();
  const openOrderCount = openOrdersData?.orders?.length ?? 0;

  const tabs: TabConfig[] = [
    { id: 'openOrders', label: 'Open Orders', badge: openOrderCount > 0 ? openOrderCount : undefined },
    { id: 'orderHistory', label: 'Order History' },
    { id: 'tradeHistory', label: 'Trade History' },
    { id: 'depth', label: 'Depth' },
    { id: 'assets', label: 'Assets' },
  ];

  return (
    <div className={`bg-theme-bg-secondary rounded-lg flex flex-col ${className}`}>
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
        {activeTab === 'orderHistory' && <OrderHistoryTab />}
        {activeTab === 'tradeHistory' && <TradeHistoryTab />}
        {activeTab === 'depth' && (
          <div className="min-h-[180px] h-full">
            <DepthChart
              bids={orderbookData?.orderbook?.bids ?? []}
              asks={orderbookData?.orderbook?.asks ?? []}
              midPrice={orderbookData?.midPrice ?? 0}
            />
          </div>
        )}
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

// Assets Tab - shows user balances with Deposit/Withdraw actions
function AssetsTab() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;

  const { balanceManagerId, isLoading, handleDepositToken, handleWithdrawToken, lastAutoDepositError } = useOrderActions();
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const bmBalance = openOrdersData?.balance ?? { base: 0, quote: 0 };
  const assetOrders = openOrdersData?.orders ?? [];
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
