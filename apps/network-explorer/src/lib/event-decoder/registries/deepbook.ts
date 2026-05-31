/**
 * DeepBook (spot CLOB) event registry.
 *
 * DeepBook prices are stored in a pool-scaled fixed-point format
 * (price = quote_per_base * 10^9), so the human price is
 *   raw_price / 10^(quoteDecimals + 9 - baseDecimals)   // priceScaleExp
 * which depends on the pool's token decimals. The declarative FieldType system
 * cannot express that (it only sees one field value, not the pool), so these
 * events use custom decoders.
 *
 * Why this matters: for market orders DeepBook records `price` as a sentinel
 * (1 for sells, max for buys), NOT the execution price. Rendering that raw value
 * looks like a wildly wrong price. These decoders surface the real average
 * execution price (cumulative_quote / executed) and label the sentinel.
 */

import { devnetConfig } from '@nasun/devnet-config';
import type { DecodedField, ProtocolEventGroup } from '../types';
import { truncateAddress, formatTimestamp } from '../../format';

// DeepBook events carry the originalPackageId (Sui type-origin) in their type
// tag, which is immutable across package upgrades — so a single id matches every
// version's events (same guarantee analytics-fetcher.ts relies on).
const DEEPBOOK_PKG = devnetConfig.deepbook.originalPackageId;

// Pool metadata for human-readable scaling. Pool IDs come from the devnet-config
// SSOT (stay in sync on redeploy); token decimals are intrinsic protocol values.
interface PoolMeta {
  base: string;
  baseDecimals: number;
  quote: string;
  quoteDecimals: number;
}

const NUSDC_DECIMALS = 6;

const POOL_META: Record<string, PoolMeta> = {
  [devnetConfig.pools.nbtcNusdc]: { base: 'NBTC', baseDecimals: 8, quote: 'NUSDC', quoteDecimals: NUSDC_DECIMALS },
  [devnetConfig.pools.nsnNusdc]: { base: 'NSN', baseDecimals: 9, quote: 'NUSDC', quoteDecimals: NUSDC_DECIMALS },
  [devnetConfig.pools.nethNusdc]: { base: 'NETH', baseDecimals: 8, quote: 'NUSDC', quoteDecimals: NUSDC_DECIMALS },
  [devnetConfig.pools.nsolNusdc]: { base: 'NSOL', baseDecimals: 9, quote: 'NUSDC', quoteDecimals: NUSDC_DECIMALS },
};

// DeepBook V3 order status enum (sources/order_info.move)
const ORDER_STATUS: Record<string, string> = {
  '0': 'Live',
  '1': 'Partially Filled',
  '2': 'Filled',
  '3': 'Canceled',
  '4': 'Expired',
};

// Surface (rather than silently mis-scale) a pool that exists in devnet-config
// but has no decoder metadata, e.g. a new market added without updating POOL_META.
// Its order events would otherwise render with raw, unscaled prices.
for (const [name, poolId] of Object.entries(devnetConfig.pools)) {
  if (poolId && !POOL_META[poolId as string]) {
    console.warn(
      `[DeepBook decoder] pool "${name}" (${poolId}) has no decimals metadata; ` +
      `its order prices will render raw. Add it to POOL_META.`,
    );
  }
}

function poolMeta(poolId: unknown): PoolMeta | null {
  return POOL_META[String(poolId ?? '')] ?? null;
}

function num(value: unknown): number {
  const n = Number(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

// raw DeepBook price field → human quote-per-base price
function humanPrice(rawPrice: unknown, m: PoolMeta): number {
  return num(rawPrice) / Math.pow(10, m.quoteDecimals + 9 - m.baseDecimals);
}

function humanBase(raw: unknown, m: PoolMeta): number {
  return num(raw) / Math.pow(10, m.baseDecimals);
}

function humanQuote(raw: unknown, m: PoolMeta): number {
  return num(raw) / Math.pow(10, m.quoteDecimals);
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(n: number, maxDp = 6): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDp });
}

// DecodedField builders
function text(label: string, formattedValue: string): DecodedField {
  return { label, value: formattedValue, type: 'string', formattedValue };
}

function objectField(label: string, id: unknown): DecodedField {
  const value = String(id ?? '');
  return { label, value, type: 'object_id', formattedValue: truncateAddress(value), link: `/object/${value}` };
}

function addressField(label: string, addr: unknown): DecodedField {
  const value = String(addr ?? '');
  return { label, value, type: 'address', formattedValue: truncateAddress(value), link: `/address/${value}` };
}

function poolField(poolId: unknown, m: PoolMeta | null): DecodedField {
  return objectField(m ? `Pool (${m.base}/${m.quote})` : 'Pool', poolId);
}

function decodeOrderInfo(data: Record<string, unknown>): DecodedField[] {
  const m = poolMeta(data.pool_id);
  const isMarket = isTrue(data.market_order);
  const fields: DecodedField[] = [
    poolField(data.pool_id, m),
    text('Order ID', String(data.order_id ?? '-')),
    text('Side', isTrue(data.is_bid) ? 'Buy' : 'Sell'),
    text('Type', isMarket ? 'Market' : 'Limit'),
  ];

  if (m) {
    const executed = humanBase(data.executed_quantity, m);
    const cumulativeQuote = humanQuote(data.cumulative_quote_quantity, m);
    // The real fill price. Independent of the order's limit param, which is a
    // sentinel (1 / max) for market orders.
    if (executed > 0) {
      fields.push(text('Avg execution price', usd(cumulativeQuote / executed)));
    }
    const limit = humanPrice(data.price, m);
    fields.push(
      text('Limit price', isMarket ? `${usd(limit)} (market sentinel, not the fill price)` : usd(limit)),
    );
    fields.push(text('Filled / Quantity', `${qty(executed)} / ${qty(humanBase(data.original_quantity, m))} ${m.base}`));
  } else {
    fields.push(text('Price (raw)', String(data.price ?? '-')));
  }

  fields.push(text('Status', ORDER_STATUS[String(data.status ?? '')] ?? String(data.status ?? '-')));
  if (data.trader != null) fields.push(addressField('Trader', data.trader));
  if (data.timestamp != null) {
    fields.push({ label: 'Time', value: String(data.timestamp), type: 'timestamp_ms', formattedValue: formatTimestamp(String(data.timestamp)) });
  }
  return fields;
}

function decodeOrderFilled(data: Record<string, unknown>): DecodedField[] {
  const m = poolMeta(data.pool_id);
  const fields: DecodedField[] = [
    poolField(data.pool_id, m),
    text('Taker side', isTrue(data.taker_is_bid) ? 'Buy' : 'Sell'),
  ];
  if (m) {
    fields.push(text('Price', usd(humanPrice(data.price, m))));
    fields.push(text('Amount', `${qty(humanBase(data.base_quantity, m))} ${m.base}`));
    fields.push(text('Total', `${qty(humanQuote(data.quote_quantity, m), 2)} ${m.quote}`));
  } else {
    fields.push(text('Price (raw)', String(data.price ?? '-')));
    fields.push(text('Base quantity (raw)', String(data.base_quantity ?? '-')));
  }
  if (data.maker_order_id != null) fields.push(text('Maker order ID', String(data.maker_order_id)));
  if (data.taker_order_id != null) fields.push(text('Taker order ID', String(data.taker_order_id)));
  return fields;
}

function decodeOrderFullyFilled(data: Record<string, unknown>): DecodedField[] {
  const m = poolMeta(data.pool_id);
  const fields: DecodedField[] = [
    poolField(data.pool_id, m),
    text('Order ID', String(data.order_id ?? '-')),
    text('Side', isTrue(data.is_bid) ? 'Buy' : 'Sell'),
  ];
  if (m && data.original_quantity != null) {
    fields.push(text('Quantity', `${qty(humanBase(data.original_quantity, m))} ${m.base}`));
  }
  return fields;
}

export const DEEPBOOK_EVENTS: ProtocolEventGroup = {
  name: 'DeepBook',
  badgeVariant: 'info',
  packageIds: [DEEPBOOK_PKG],
  module: 'order_info',
  events: {
    OrderInfo: {
      label: 'Order',
      description: 'Order summary (placement and any immediate fills)',
      decode: decodeOrderInfo,
    },
    OrderFilled: {
      label: 'Order Filled',
      description: 'A resting maker order was matched by a taker',
      decode: decodeOrderFilled,
    },
    OrderFullyFilled: {
      label: 'Order Fully Filled',
      description: 'An order was completely filled and removed from the book',
      decode: decodeOrderFullyFilled,
    },
  },
};
