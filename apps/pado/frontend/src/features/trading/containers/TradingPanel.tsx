/**
 * TradingPanel Container
 * 주문 폼 + BalanceManager 카드 + 오픈 오더 (lg:col-span-1)
 * Simple mode: SimpleOrderForm only
 * Pro mode: Full OrderForm + BalanceManager + Open Orders
 */

import { useState } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useOrderbook, useOpenOrders, useOrderActions, type TradeMode } from '../hooks';
import { useOrderForm } from '../context';
import { useMarginAccount } from '../../core/unified-margin';
import {
  OrderForm,
  OrderConfirmModal,
  BalanceManagerCard,
  OpenOrders,
  PoolInfo,
  SimpleOrderForm,
} from '../components';

interface TradingPanelProps {
  mode?: TradeMode;
}

type FundingSource = 'trading' | 'pado';

export function TradingPanel({ mode = 'pro' }: TradingPanelProps) {
  const isSimple = mode === 'simple';
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  // Pado Balance integration
  const { account: marginAccount, hasAccount: hasMarginAccount } = useMarginAccount();
  const [fundingSource, setFundingSource] = useState<FundingSource>('trading');

  // NUSDC balance from Pado Balance
  const padoBalance = marginAccount?.nusdcBalance
    ? Number(marginAccount.nusdcBalance) / 1e6
    : 0;

  // 오더북 데이터 (가격 정보)
  const { data: orderbookData } = useOrderbook();
  const midPrice = orderbookData?.midPrice ?? 0;
  const bestBid = orderbookData?.orderbook?.bids[0]?.price ?? 0;
  const bestAsk = orderbookData?.orderbook?.asks[0]?.price ?? 0;

  // 주문 액션
  const {
    isLoading,
    balanceManagerId,
    handleLimitOrder,
    handleMarketOrder,
    handleCancelOrder,
    handleCreateBalanceManager,
    handleDeposit,
    handleWithdraw,
  } = useOrderActions();

  // 오픈 오더 데이터
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const orders = openOrdersData?.orders ?? [];
  const bmBalance = openOrdersData?.balance ?? { base: 0, quote: 0 };

  // 주문 폼 상태 (Context)
  const {
    price,
    amount,
    executionOption,
    setExecutionOption,
    getOrderType,
    slippage,
    setSlippage,
    isConfirmModalOpen,
    pendingOrderType,
    setPrice,
    setAmount,
    openConfirmModal,
    closeConfirmModal,
    resetForm,
  } = useOrderForm();

  // 지정가 주문 실행
  const handleConfirmOrder = async () => {
    if (!price || !amount) return;

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    const orderType = getOrderType();

    const result = await handleLimitOrder(pendingOrderType, priceNum, amountNum, orderType);

    closeConfirmModal();

    if (result.success) {
      resetForm();
    }
  };

  // 시장가 매수
  const handleMarketBuy = async () => {
    if (!amount) return;
    const amountNum = parseFloat(amount);
    const result = await handleMarketOrder('buy', amountNum);
    if (result.success) {
      setAmount('');
    }
  };

  // 시장가 매도
  const handleMarketSell = async () => {
    if (!amount) return;
    const amountNum = parseFloat(amount);
    const result = await handleMarketOrder('sell', amountNum);
    if (result.success) {
      setAmount('');
    }
  };

  // Simple mode market buy handler (receives baseAmount directly)
  const handleSimpleMarketBuy = async (baseAmount: number) => {
    const result = await handleMarketOrder('buy', baseAmount);
    return result.success;
  };

  // Simple mode market sell handler
  const handleSimpleMarketSell = async (baseAmount: number) => {
    const result = await handleMarketOrder('sell', baseAmount);
    return result.success;
  };

  // Simple Mode UI
  if (isSimple) {
    return (
      <div className="space-y-4">
        <div className="bg-theme-bg-secondary rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-theme-text-primary">Quick Trade</h3>

          {/* Connect wallet banner when not connected */}
          {!isConnected && (
            <div className="mb-4 p-3 rounded text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 text-center">
              Connect wallet to start trading
            </div>
          )}

          {/* Trading Balance setup for Simple mode */}
          {isConnected && !balanceManagerId && (
            <div className="mb-4 p-4 bg-theme-bg-tertiary rounded-lg text-center">
              <p className="text-sm text-theme-text-secondary mb-3">
                Enable trading to start placing orders
              </p>
              <button
                onClick={handleCreateBalanceManager}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isLoading ? 'Enabling...' : 'Enable Trading'}
              </button>
            </div>
          )}

          {/* Simple Order Form */}
          <SimpleOrderForm
            midPrice={midPrice}
            onMarketBuy={handleSimpleMarketBuy}
            onMarketSell={handleSimpleMarketSell}
            disabled={!isConnected || !balanceManagerId}
            isLoading={isLoading}
            quoteBalance={bmBalance.quote}
            baseBalance={bmBalance.base}
          />
        </div>
      </div>
    );
  }

  // Pro Mode UI (original)
  return (
    <div className="space-y-4">
      {/* Funding Source Selector */}
      {isConnected && (
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 text-theme-text-primary">Funding Source</h3>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setFundingSource('trading')}
              className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                fundingSource === 'trading'
                  ? 'bg-blue-600 text-white'
                  : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
              }`}
            >
              Trading Balance
            </button>
            <button
              onClick={() => setFundingSource('pado')}
              disabled={!hasMarginAccount}
              className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                fundingSource === 'pado'
                  ? 'bg-blue-600 text-white'
                  : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
              }`}
              title={!hasMarginAccount ? 'Enable Pado Balance in Wallet tab first' : undefined}
            >
              Pado {!hasMarginAccount && '🔒'}
            </button>
          </div>

          {/* Pado Balance hint when not enabled */}
          {!hasMarginAccount && (
            <p className="text-xs text-theme-text-muted mb-3">
              💡 <a href="/wallet" className="text-blue-500 hover:text-blue-400 underline">Enable Pado Balance</a> to use funds across all features
            </p>
          )}

          {/* Coming Soon notice for Pado Balance */}
          {fundingSource === 'pado' && hasMarginAccount && (
            <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-400">
                🚀 Pado Balance funding coming in v0.5!
              </p>
              <p className="text-xs text-theme-text-muted mt-1">
                Trading Balance will be used for this trade.
              </p>
              <p className="text-xs text-theme-text-muted mt-1">
                Pado Balance: {padoBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NUSDC
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trading Balance Card - 독립 카드 */}
      {isConnected && (
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 text-theme-text-primary">Trading Balance</h3>
          <BalanceManagerCard
            balanceManagerId={balanceManagerId}
            balance={bmBalance}
            isLoading={isLoading}
            onCreate={handleCreateBalanceManager}
            onDeposit={handleDeposit}
            onWithdraw={handleWithdraw}
          />
        </div>
      )}

      {/* Place Order Card */}
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-text-primary">Place Order</h3>

        {/* Connect wallet banner when not connected */}
        {!isConnected && (
          <div className="mb-4 p-3 rounded text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 text-center">
            Connect wallet to start trading
          </div>
        )}

        {/* Order Form */}
        <OrderForm
          price={price}
          amount={amount}
          onPriceChange={setPrice}
          onAmountChange={setAmount}
          onBuy={() => openConfirmModal('buy')}
          onSell={() => openConfirmModal('sell')}
          onMarketBuy={handleMarketBuy}
          onMarketSell={handleMarketSell}
          disabled={!isConnected || !balanceManagerId}
          isLoading={isLoading}
          midPrice={midPrice}
          bestBid={bestBid}
          bestAsk={bestAsk}
          executionOption={executionOption}
          onExecutionOptionChange={setExecutionOption}
          slippage={slippage}
          onSlippageChange={setSlippage}
        />

        {/* Order Confirmation Modal */}
        <OrderConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={closeConfirmModal}
          onConfirm={handleConfirmOrder}
          orderType={pendingOrderType}
          price={price}
          amount={amount}
          isLoading={isLoading}
        />

        {/* Pool Info */}
        <PoolInfo />

        {/* Open Orders */}
        {isConnected && balanceManagerId && (
          <OpenOrders
            orders={orders}
            isLoading={isLoading}
            onCancel={handleCancelOrder}
          />
        )}
      </div>
    </div>
  );
}
