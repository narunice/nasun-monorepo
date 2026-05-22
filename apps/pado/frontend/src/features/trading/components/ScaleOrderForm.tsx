/**
 * ScaleOrderForm
 * Distribute multiple limit orders across a price range.
 * Inspired by Hyperliquid's scale order feature.
 */

import { useState, useMemo, useCallback } from 'react';
import { NumberInput } from '@/components/ui/NumberInput';
import { snapToTick, snapToLot, getMinPrice, getMinQuantity } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

export type Distribution = 'uniform' | 'linear-asc' | 'linear-desc';

export interface ScaleOrderItem {
  price: number;
  quantity: number;
}

interface ScaleOrderFormProps {
  side: 'buy' | 'sell';
  availableQuote: number;
  availableBase: number;
  midPrice: number;
  feeRate: number;
  onSubmit: (orders: ScaleOrderItem[], side: 'buy' | 'sell') => void;
  disabled: boolean;
  isLoading: boolean;
}

const ORDER_COUNTS = [3, 5, 10, 20] as const;

function computeScaleOrders(
  fromPrice: number,
  toPrice: number,
  numOrders: number,
  totalAmount: number,
  distribution: Distribution,
): ScaleOrderItem[] {
  if (numOrders < 2 || totalAmount <= 0 || fromPrice <= 0 || toPrice <= 0) return [];
  if (fromPrice === toPrice) {
    return [{ price: fromPrice, quantity: totalAmount }];
  }

  const orders: ScaleOrderItem[] = [];
  const step = (toPrice - fromPrice) / (numOrders - 1);

  // Compute weights based on distribution
  const weights: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    switch (distribution) {
      case 'uniform':
        weights.push(1);
        break;
      case 'linear-asc':
        weights.push(i + 1);
        break;
      case 'linear-desc':
        weights.push(numOrders - i);
        break;
    }
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < numOrders; i++) {
    const price = fromPrice + step * i;
    const quantity = (totalAmount * weights[i]) / totalWeight;
    orders.push({ price, quantity });
  }

  return orders;
}

export function ScaleOrderForm({
  side,
  availableQuote,
  availableBase,
  midPrice,
  feeRate,
  onSubmit,
  disabled,
  isLoading,
}: ScaleOrderFormProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;
  const minPrice = useMemo(() => getMinPrice(currentPool), [currentPool]);
  const minQuantity = useMemo(() => getMinQuantity(currentPool), [currentPool]);

  // tickSize human value reuses getMinPrice (priceScaleExp-aware) to avoid the
  // 10x inflation for baseDecimals=8 pools; see project_2026_05_19_pado_price_10x_regression.
  const tickSizeUsd = minPrice;
  const priceDecimals = Math.max(0, -Math.floor(Math.log10(tickSizeUsd)));
  const lotSizeBase = currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals);
  const qtyDecimals = Math.max(0, -Math.floor(Math.log10(lotSizeBase)));

  const [fromPrice, setFromPrice] = useState('');
  const [toPrice, setToPrice] = useState('');
  const [numOrders, setNumOrders] = useState(5);
  const [totalAmount, setTotalAmount] = useState('');
  const [distribution, setDistribution] = useState<Distribution>('uniform');

  const isBuy = side === 'buy';
  const fromNum = parseFloat(fromPrice) || 0;
  const toNum = parseFloat(toPrice) || 0;
  const amountNum = parseFloat(totalAmount) || 0;

  // Compute preview orders
  const previewOrders = useMemo(() => {
    if (fromNum <= 0 || toNum <= 0 || amountNum <= 0) return [];
    return computeScaleOrders(fromNum, toNum, numOrders, amountNum, distribution);
  }, [fromNum, toNum, numOrders, amountNum, distribution]);

  // Snap preview prices to tick and quantities to lot-size
  const snappedOrders = useMemo(() => {
    return previewOrders.map(o => ({
      price: snapToTick(o.price, currentPool),
      quantity: snapToLot(o.quantity, currentPool),
    }));
  }, [previewOrders, currentPool]);

  // Total cost estimation
  const totalCost = useMemo(() => {
    return snappedOrders.reduce((sum, o) => sum + o.price * o.quantity, 0);
  }, [snappedOrders]);

  // Validation
  const priceRangeValid = fromNum > 0 && toNum > 0;
  const amountValid = amountNum > 0;
  const perOrderQtyValid = amountNum > 0 && amountNum / numOrders >= minQuantity;
  const costExceedsBalance = isBuy && totalCost * (1 + feeRate) > availableQuote;
  const amountExceedsBalance = !isBuy && amountNum > availableBase;

  const canSubmit = priceRangeValid && amountValid && perOrderQtyValid && !costExceedsBalance && !amountExceedsBalance && !disabled && !isLoading;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || snappedOrders.length === 0) return;
    onSubmit(snappedOrders, side);
  }, [canSubmit, snappedOrders, side, onSubmit]);

  // Quick fill from midPrice
  const handleAutoRange = useCallback(() => {
    if (midPrice <= 0) return;
    const offset = midPrice * 0.02; // 2% range
    if (isBuy) {
      setFromPrice(snapToTick(midPrice - offset * 2, currentPool).toString());
      setToPrice(snapToTick(midPrice - offset * 0.5, currentPool).toString());
    } else {
      setFromPrice(snapToTick(midPrice + offset * 0.5, currentPool).toString());
      setToPrice(snapToTick(midPrice + offset * 2, currentPool).toString());
    }
  }, [midPrice, isBuy, currentPool]);

  // Percentage amount
  const handlePercentAmount = useCallback((pct: number) => {
    if (isBuy) {
      const avgPrice = (fromNum + toNum) / 2 || midPrice || 1;
      const usableQuote = availableQuote / (1 + feeRate);
      const baseAmt = (usableQuote * pct / 100) / avgPrice;
      setTotalAmount(baseAmt > 0 ? baseAmt.toFixed(4) : '');
    } else {
      const baseAmt = availableBase * pct / 100;
      setTotalAmount(baseAmt > 0 ? baseAmt.toFixed(4) : '');
    }
  }, [isBuy, fromNum, toNum, midPrice, availableQuote, availableBase, feeRate]);

  return (
    <div className="space-y-2 flex-1 flex flex-col">
      {/* Price Range */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Price Range ({quoteSymbol})</label>
          <button
            onClick={handleAutoRange}
            disabled={midPrice <= 0}
            className="px-1.5 py-0.5 text-[10px] xl:text-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-theme-text-primary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Auto
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            placeholder="From"
            value={fromPrice}
            onChange={(e) => setFromPrice(e.target.value)}
            step={minPrice}
            className="px-2 py-1.5 text-sm"
          />
          <NumberInput
            placeholder="To"
            value={toPrice}
            onChange={(e) => setToPrice(e.target.value)}
            step={minPrice}
            className="px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Number of Orders */}
      <div>
        <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted mb-1 block">Orders</label>
        <div className="flex gap-1">
          {ORDER_COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => setNumOrders(n)}
              className={`flex-1 py-1 text-trading-xs xl:text-trading-sm font-medium rounded transition-colors ${
                numOrders === n
                  ? 'bg-pd1/20 text-pd3'
                  : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Total Amount */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Total Amount ({baseSymbol})</label>
          <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Min {(minQuantity * numOrders).toFixed(4)}</span>
        </div>
        <NumberInput
          placeholder="0.0000"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          step={minQuantity}
          className="px-3 py-2 text-sm"
        />
        <div className="flex gap-1 mt-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePercentAmount(pct)}
              className="flex-1 py-1 text-trading-xs xl:text-trading-sm font-medium rounded bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Distribution */}
      <div>
        <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted mb-1 block">Distribution</label>
        <div className="flex gap-1">
          {([
            { value: 'uniform' as const, label: 'Uniform' },
            { value: 'linear-asc' as const, label: 'Linear \u25B2' },
            { value: 'linear-desc' as const, label: 'Linear \u25BC' },
          ]).map((d) => (
            <button
              key={d.value}
              onClick={() => setDistribution(d.value)}
              className={`flex-1 py-1 text-trading-xs xl:text-trading-sm font-medium rounded transition-colors ${
                distribution === d.value
                  ? 'bg-pd1/20 text-pd3'
                  : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Order Preview */}
      {snappedOrders.length > 0 && (
        <div className="bg-theme-bg-tertiary/50 rounded p-2 max-h-[140px] overflow-y-auto">
          <div className="text-[10px] font-semibold text-theme-text-muted mb-1">Preview ({snappedOrders.length} orders)</div>
          <div className="space-y-px">
            {snappedOrders.map((order, i) => (
              <div key={i} className="flex justify-between text-[11px] font-mono">
                <span className="text-theme-text-muted">#{i + 1}</span>
                <span className="text-theme-text-secondary">{order.quantity.toFixed(qtyDecimals)} {baseSymbol}</span>
                <span className="text-theme-text-muted">@</span>
                <span className={isBuy ? 'text-trading-bid' : 'text-trading-ask'}>
                  {order.price.toFixed(priceDecimals)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-mono mt-1 pt-1 border-t border-theme-border/50">
            <span className="text-theme-text-muted">Total</span>
            <span className="text-theme-text-secondary">
              {amountNum.toFixed(qtyDecimals)} {baseSymbol} / ~{totalCost.toFixed(priceDecimals)} {quoteSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Validation messages */}
      {amountNum > 0 && !perOrderQtyValid && (
        <p className="text-trading-xs xl:text-trading-sm text-yellow-400">
          Each order must be at least {minQuantity} {baseSymbol}
        </p>
      )}
      {costExceedsBalance && (
        <p className="text-trading-xs xl:text-trading-sm text-red-400">Insufficient {quoteSymbol} balance</p>
      )}
      {amountExceedsBalance && (
        <p className="text-trading-xs xl:text-trading-sm text-red-400">Insufficient {baseSymbol} balance</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`mt-auto w-full py-2 font-semibold rounded transition-colors text-white disabled:opacity-50 ${
          isBuy ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        {isLoading
          ? 'Placing...'
          : `Place ${snappedOrders.length} ${isBuy ? 'Buy' : 'Sell'} Orders`}
      </button>
    </div>
  );
}
