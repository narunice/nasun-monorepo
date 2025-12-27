/**
 * TradingPanel Container
 * 주문 폼 + BalanceManager 카드 + 오픈 오더 (lg:col-span-1)
 */

import { useWallet } from '../../../wallet';
import { useOrderbook, useOpenOrders, useOrderActions } from '../hooks';
import { useOrderForm } from '../context';
import {
  OrderForm,
  OrderConfirmModal,
  BalanceManagerCard,
  OpenOrders,
  PoolInfo,
} from '../components';

export function TradingPanel() {
  const { status, account } = useWallet();
  const isConnected = status === 'unlocked' && account;

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

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Place Order</h3>

      {/* Connect wallet banner when not connected */}
      {!isConnected && (
        <div className="mb-4 p-3 rounded text-sm bg-yellow-900/30 text-yellow-400 border border-yellow-700 text-center">
          Connect wallet to start trading
        </div>
      )}

      {/* BalanceManager Card */}
      {isConnected && (
        <BalanceManagerCard
          balanceManagerId={balanceManagerId}
          balance={bmBalance}
          isLoading={isLoading}
          onCreate={handleCreateBalanceManager}
          onDeposit={handleDeposit}
          onWithdraw={handleWithdraw}
        />
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
  );
}
