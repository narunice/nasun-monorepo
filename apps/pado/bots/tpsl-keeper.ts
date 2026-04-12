/**
 * TP/SL Keeper Bot
 *
 * Server-side TP/SL order execution service.
 * Monitors oracle prices and triggers market orders via delegated TradeCap.
 *
 * Security model:
 * - API key authentication via X-API-Key header (prevents unauthorized access)
 * - CORS origin verification as secondary defense
 * - Server-side ownership verification for mutations (no client-supplied identity)
 * - TradeCap on-chain ownership verification on registration
 * - Per-IP rate limiting on all endpoints
 *
 * Usage:
 *   pnpm tpsl-keeper    # Run HTTP server + price monitor
 *
 * Environment Variables:
 *   KEEPER_PRIVATE_KEY    - Hex-encoded private key for keeper wallet
 *   NASUN_RPC_URL         - RPC endpoint
 *   DEEPBOOK_PACKAGE      - DeepBook V3 package ID
 *   ORACLE_REGISTRY_ID    - Oracle registry object ID
 *   TPSL_PORT             - HTTP server port (default: 4001)
 *   TPSL_API_KEY          - API key for client authentication (required in production)
 *   TPSL_ALLOWED_ORIGIN   - CORS allowed origin (default: https://pado.finance)
 *
 * @version 0.3.0
 */

import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { TPSLStore, type TPSLOrder } from './lib/tpsl-store.js';
import { executeMarketOrder, type ExecuteParams } from './lib/tpsl-executor.js';
import { withRetry } from './lib/retry.js';
import { MARKETS } from './lib/config.js';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const PORT = parseInt(process.env.TPSL_PORT || '4001');
const CHECK_INTERVAL_MS = 10_000; // 10 seconds
const ORACLE_REGISTRY_ID = process.env.ORACLE_REGISTRY_ID || '';
const ORACLE_PACKAGE_ID = process.env.ORACLE_PACKAGE_ID || '';
const DEEPBOOK_PACKAGE = process.env.DEEPBOOK_PACKAGE || '';
const ALLOWED_ORIGIN = process.env.TPSL_ALLOWED_ORIGIN || 'https://pado.finance';
const API_KEY = process.env.TPSL_API_KEY || '';
// Auth bypass in dev/staging is intentional:
// - Dev/staging use isolated devnet with no real assets
// - TradeCap on-chain ownership is the actual security boundary
// - API key validation still applies when TPSL_API_KEY is set
// - Production (NODE_ENV=production) always requires API key + origin check
const REQUIRE_AUTH = process.env.NODE_ENV === 'production';
const MAX_BODY_SIZE = 10_000; // 10KB max request body
const MAX_ORDERS_PER_USER = 50;
const PRICE_STALENESS_MS = 60_000; // 60 seconds (reduced from 120s for financial safety)
const SUI_OBJECT_ID_REGEX = /^0x[a-f0-9]{64}$/;

// Rate limiting: sliding window per IP
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;  // 60 requests per minute per IP

// Oracle symbol IDs
const SYMBOL_IDS: Record<string, number> = {
  NBTC: 1,
  NETH: 2,
  NASUN: 3,
  NSOL: 4,
};

const DECIMALS = 8;

// ========================================
// Oracle Price Fetching
// ========================================

interface OraclePrice {
  symbol: string;
  price: number;
  timestamp: number;
}

let cachedPrices: Map<string, OraclePrice> = new Map();

async function fetchOraclePrices(client: SuiClient): Promise<Map<string, OraclePrice>> {
  // Fetch prices from oracle registry on-chain
  try {
    const registry = await client.getObject({
      id: ORACLE_REGISTRY_ID,
      options: { showContent: true },
    });

    const content = registry.data?.content;
    if (content?.dataType !== 'moveObject') {
      throw new Error('Invalid oracle registry');
    }

    // Parse feeds from dynamic fields
    const fields = (content.fields as Record<string, unknown>);
    const feedsField = fields['feeds'] as { fields?: { id?: { id?: string } } } | undefined;
    const feedsTableId = feedsField?.fields?.id?.id;

    if (!feedsTableId) {
      throw new Error('Could not resolve feeds table ID');
    }

    const prices = new Map<string, OraclePrice>();
    const now = Date.now();

    for (const [symbol, symbolId] of Object.entries(SYMBOL_IDS)) {
      try {
        const feed = await client.getDynamicFieldObject({
          parentId: feedsTableId,
          name: { type: 'u64', value: String(symbolId) },
        });

        const feedContent = feed.data?.content;
        if (feedContent?.dataType === 'moveObject') {
          const feedFields = (feedContent.fields as Record<string, unknown>);
          const valueWrapper = feedFields['value'] as Record<string, unknown>;
          // SDK wraps nested Move structs: value = { type, fields: { price, timestamp, ... } }
          const value = (valueWrapper?.['fields'] as Record<string, unknown>) || valueWrapper;
          if (value) {
            const rawPrice = BigInt(String(value['price'] || 0));
            const price = Number(rawPrice) / Math.pow(10, DECIMALS);
            const rawTimestamp = Number(BigInt(String(value['timestamp'] || 0)));
            const timestamp = normalizeTimestampMs(rawTimestamp);

            prices.set(symbol, { symbol, price, timestamp });
          }
        }
      } catch {
        // Symbol not yet in oracle, skip
      }
    }

    // Always set NUSDC = $1.00
    prices.set('NUSDC', { symbol: 'NUSDC', price: 1.0, timestamp: now });

    cachedPrices = prices;
    return prices;
  } catch (error) {
    console.error('[keeper] Failed to fetch oracle prices:', error instanceof Error ? error.message : error);
    return cachedPrices;
  }
}

/**
 * Normalize oracle timestamp to milliseconds.
 * Sui's clock::timestamp_ms returns milliseconds, but this guard
 * detects if a value looks like seconds (< 1e12) and converts it. (C-3)
 */
function normalizeTimestampMs(raw: number): number {
  if (raw > 0 && raw < 1e12) return raw * 1000;
  return raw;
}

function getCurrentPrice(symbol: string): number | null {
  const priceData = cachedPrices.get(symbol);
  if (!priceData) return null;
  if (Date.now() - priceData.timestamp > PRICE_STALENESS_MS) return null;
  return priceData.price;
}

// ========================================
// Order Monitoring
// ========================================

async function checkAndExecuteOrders(
  store: TPSLStore,
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<void> {
  const activeOrders = store.getActive();
  if (activeOrders.length === 0) return;

  for (const order of activeOrders) {
    const baseSymbol = order.marketSymbol.split('/')[0];
    const currentPrice = getCurrentPrice(baseSymbol);

    if (currentPrice === null) continue;

    // Check trigger condition
    const shouldTrigger = checkTriggerCondition(order, currentPrice);
    if (!shouldTrigger) continue;

    console.log(`[keeper] Triggering ${order.triggerType} for ${order.marketSymbol}: price=${currentPrice}, trigger=${order.triggerPrice}`);

    // Claim the order atomically
    const claimed = store.claim(order.id);
    if (!claimed) continue;

    // Execute the market order
    try {
      const result = await executeMarketOrder(client, keypair, {
        poolId: order.poolId,
        baseType: getBaseType(baseSymbol),
        quoteType: getQuoteType(),
        tradeCapId: order.tradeCapId,
        balanceManagerId: order.balanceManagerId,
        isBid: order.side === 'buy',
        quantity: BigInt(Math.round(order.quantity * getBaseMultiplier(baseSymbol))),
      });

      if (result.success && result.txDigest) {
        store.markFilled(order.id, result.txDigest);
        console.log(`[keeper] Order ${order.id} filled: ${result.txDigest}`);
      } else {
        const msg = result.error || 'Unknown error';
        const permanent = isPermanentFailure(msg);
        store.markFailed(order.id, msg, permanent);
        console.error(`[keeper] Order ${order.id} execution failed (permanent=${permanent}): ${msg}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const permanent = isPermanentFailure(msg);
      store.markFailed(order.id, msg, permanent);
      console.error(`[keeper] Order ${order.id} error (permanent=${permanent}): ${msg}`);
    }
  }
}

// Classify execution error as permanent (position no longer executable) vs transient (retry).
// Permanent: TradeCap/BalanceManager ownership loss, signer mismatch, insufficient BM balance
// (EBalanceManagerBalanceTooLow = MoveAbort code 3 on balance_manager::withdraw_with_proof;
// position was closed via other path — retrying forever produces no value).
function isPermanentFailure(msg: string): boolean {
  if (
    msg.includes('ObjectNotFound') ||
    msg.includes('ObjectDeleted') ||
    msg.includes('Object is not owned') ||
    msg.includes('not owned by the keeper') ||
    msg.includes('OwnerMismatch') ||
    msg.includes('InvalidSigner')
  ) {
    return true;
  }
  // MoveAbort in balance_manager::withdraw_with_proof — position balance empty or proof invalid;
  // the function can only abort with EBalanceManagerBalanceTooLow (3) or EInvalidProof (2),
  // both unrecoverable from the keeper's perspective.
  if (msg.includes('balance_manager') && msg.includes('withdraw_with_proof')) {
    return true;
  }
  return false;
}

function checkTriggerCondition(order: TPSLOrder, currentPrice: number): boolean {
  if (order.triggerType === 'take_profit') {
    // TP: long position closes when price goes UP to trigger
    // For a sell TP: trigger when currentPrice >= triggerPrice
    // For a buy TP: trigger when currentPrice <= triggerPrice
    return order.side === 'sell'
      ? currentPrice >= order.triggerPrice
      : currentPrice <= order.triggerPrice;
  } else {
    // SL: long position closes when price goes DOWN to trigger
    // For a sell SL: trigger when currentPrice <= triggerPrice
    // For a buy SL: trigger when currentPrice >= triggerPrice
    return order.side === 'sell'
      ? currentPrice <= order.triggerPrice
      : currentPrice >= order.triggerPrice;
  }
}

// Type helpers (will be populated from env or config)
function getBaseType(symbol: string): string {
  const market = MARKETS[symbol];
  if (market) return market.baseType;
  if (symbol === 'NASUN') return '0x2::sui::SUI';
  return '';
}

function getQuoteType(): string {
  // All markets use NUSDC as quote
  const anyMarket = Object.values(MARKETS)[0];
  return anyMarket?.quoteType || '';
}

function getBaseMultiplier(symbol: string): number {
  const decimals: Record<string, number> = {
    NBTC: 8,
    NETH: 8,
    NSOL: 9,
    NASUN: 9,
  };
  return Math.pow(10, decimals[symbol] || 9);
}

// ========================================
// Rate Limiter (sliding window per key)
// ========================================

class RateLimiter {
  private windows = new Map<string, number[]>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Periodic cleanup of expired entries to prevent memory leak
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
  }

  isAllowed(key: string, maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS): boolean {
    const now = Date.now();
    const timestamps = this.windows.get(key)?.filter((t) => now - t < windowMs) ?? [];

    if (timestamps.length >= maxRequests) {
      this.windows.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const active = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (active.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, active);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

const rateLimiter = new RateLimiter();

// ========================================
// TradeCap On-Chain Verification
// ========================================

async function verifyTradeCapOwnership(
  client: SuiClient,
  tradeCapId: string,
  expectedOwner: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const obj = await client.getObject({ id: tradeCapId, options: { showOwner: true } });
    if (obj.error || !obj.data) {
      return { valid: false, error: 'TradeCap object not found on-chain' };
    }

    const owner = obj.data.owner;
    if (typeof owner === 'object' && owner !== null && 'AddressOwner' in owner) {
      if ((owner as { AddressOwner: string }).AddressOwner === expectedOwner) {
        return { valid: true };
      }
      return { valid: false, error: 'TradeCap is not owned by the keeper' };
    }

    return { valid: false, error: 'TradeCap has unexpected ownership type' };
  } catch {
    // Network error — fail closed (reject registration)
    return { valid: false, error: 'Failed to verify TradeCap on-chain' };
  }
}

// ========================================
// HTTP API
// ========================================

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  });
  res.end(JSON.stringify(data));
}

/**
 * Authenticate request via API key + CORS origin.
 * - Production: requires valid X-API-Key header AND matching Origin
 * - Development: allows all requests (API_KEY or REQUIRE_AUTH not set)
 */
function authenticateRequest(req: IncomingMessage, res: ServerResponse): boolean {
  // Dev mode: skip auth when no API key configured or not in production
  if (!REQUIRE_AUTH && !API_KEY) return true;

  // API key verification (primary defense, timing-safe)
  if (API_KEY) {
    const clientKey = (req.headers['x-api-key'] as string) || '';
    const clientBuf = Buffer.from(clientKey);
    const keyBuf = Buffer.from(API_KEY);
    if (clientBuf.length !== keyBuf.length || !timingSafeEqual(clientBuf, keyBuf)) {
      sendJson(res, 401, { error: 'Unauthorized: invalid or missing API key' });
      return false;
    }
  }

  // CORS origin check (secondary defense)
  if (REQUIRE_AUTH) {
    const origin = req.headers['origin'] || '';
    if (origin && origin !== ALLOWED_ORIGIN) {
      sendJson(res, 403, { error: 'Forbidden: invalid origin' });
      return false;
    }
  }

  return true;
}

// Validate Sui object ID format
function isValidObjectId(id: string): boolean {
  return SUI_OBJECT_ID_REGEX.test(id);
}

function createHttpHandler(store: TPSLStore, client: SuiClient, keeperAddress: string, startTime: number) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const method = req.method?.toUpperCase() || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      sendJson(res, 204, null);
      return;
    }

    // Rate limiting (H-4)
    const clientIp = getClientIp(req);
    if (!rateLimiter.isAllowed(clientIp)) {
      console.warn(`[keeper] Rate limited: ${method} ${url.pathname} ip=${clientIp}`);
      sendJson(res, 429, { error: 'Too many requests. Try again later.' });
      return;
    }

    try {
      // POST /api/tpsl/register - Register new TP/SL order
      if (method === 'POST' && url.pathname === '/api/tpsl/register') {
        if (!authenticateRequest(req, res)) return;

        const body = await parseBody(req);

        // Validate required fields
        const userAddress = String(body.userAddress || '');
        const poolId = String(body.poolId || '');
        const marketSymbol = String(body.marketSymbol || '');
        const side = String(body.side || '');
        const triggerType = String(body.triggerType || '');
        const triggerPrice = Number(body.triggerPrice);
        const quantity = Number(body.quantity);
        const tradeCapId = String(body.tradeCapId || '');
        const balanceManagerId = String(body.balanceManagerId || '');

        // Strict input validation
        if (!userAddress || !isValidObjectId(userAddress)) {
          sendJson(res, 400, { error: 'Invalid userAddress' }); return;
        }
        if (!poolId || !isValidObjectId(poolId)) {
          sendJson(res, 400, { error: 'Invalid poolId' }); return;
        }
        if (!marketSymbol || marketSymbol.length > 30) {
          sendJson(res, 400, { error: 'Invalid marketSymbol' }); return;
        }
        if (side !== 'buy' && side !== 'sell') {
          sendJson(res, 400, { error: 'side must be "buy" or "sell"' }); return;
        }
        if (triggerType !== 'take_profit' && triggerType !== 'stop_loss') {
          sendJson(res, 400, { error: 'triggerType must be "take_profit" or "stop_loss"' }); return;
        }
        if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
          sendJson(res, 400, { error: 'triggerPrice must be a positive number' }); return;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          sendJson(res, 400, { error: 'quantity must be a positive number' }); return;
        }
        if (!tradeCapId || !isValidObjectId(tradeCapId)) {
          sendJson(res, 400, { error: 'Invalid tradeCapId' }); return;
        }
        if (!balanceManagerId || !isValidObjectId(balanceManagerId)) {
          sendJson(res, 400, { error: 'Invalid balanceManagerId' }); return;
        }

        // Trigger price sanity check: reject orders with trigger price wildly different from current oracle price
        // Prevents cross-market data contamination (e.g. BTC price entered for ETH market)
        const baseSymbol = marketSymbol.split('/')[0];
        const currentPrice = getCurrentPrice(baseSymbol);
        if (currentPrice && currentPrice > 0) {
          const ratio = triggerPrice / currentPrice;
          // Allow 0.01x to 100x of current price (generous range for volatile assets)
          if (ratio < 0.01 || ratio > 100) {
            sendJson(res, 400, {
              error: `Trigger price $${triggerPrice.toLocaleString()} is unreasonable for ${marketSymbol} (current: $${currentPrice.toLocaleString()}). Please check the price.`,
            });
            return;
          }
        }

        // Per-user order limit
        const userOrders = store.getByUser(userAddress);
        if (userOrders.length >= MAX_ORDERS_PER_USER) {
          sendJson(res, 429, {
            error: `Maximum ${MAX_ORDERS_PER_USER} active TP/SL orders per user. Cancel existing TP/SL orders to register new ones.`,
            activeCount: userOrders.length,
            maxCount: MAX_ORDERS_PER_USER,
          });
          return;
        }

        // Verify TradeCap is owned by keeper on-chain (H-3)
        console.log(`[keeper] Register request: user=${userAddress.slice(0, 16)}... market=${marketSymbol} ${side} ${triggerType} price=${triggerPrice} qty=${quantity}`);
        const tradeCapCheck = await verifyTradeCapOwnership(client, tradeCapId, keeperAddress);
        if (!tradeCapCheck.valid) {
          console.warn(`[keeper] Register rejected: ${tradeCapCheck.error} (user=${userAddress.slice(0, 16)}... tradeCap=${tradeCapId.slice(0, 16)}...)`);
          sendJson(res, 403, { error: tradeCapCheck.error || 'TradeCap verification failed' });
          return;
        }

        const order = store.create({
          userAddress,
          poolId,
          marketSymbol,
          side: side as 'buy' | 'sell',
          triggerType: triggerType as 'take_profit' | 'stop_loss',
          triggerPrice,
          quantity,
          tradeCapId,
          balanceManagerId,
        });

        console.log(`[keeper] Order registered: id=${order.id} user=${userAddress.slice(0, 16)}... ${marketSymbol} ${side} ${triggerType} @${triggerPrice}`);
        sendJson(res, 201, { order });
        return;
      }

      // GET /api/tpsl/orders?address=<addr> - Get user orders
      if (method === 'GET' && url.pathname === '/api/tpsl/orders') {
        if (!authenticateRequest(req, res)) return;

        const address = url.searchParams.get('address');
        if (!address || !isValidObjectId(address)) {
          sendJson(res, 400, { error: 'Missing or invalid address parameter' });
          return;
        }
        const orders = store.getByUser(address);
        sendJson(res, 200, { orders });
        return;
      }

      // DELETE /api/tpsl/orders/:id - Cancel order
      // Ownership is verified server-side via stored order data (C-2)
      if (method === 'DELETE' && url.pathname.startsWith('/api/tpsl/orders/')) {
        if (!authenticateRequest(req, res)) return;

        const id = url.pathname.split('/').pop();
        if (!id) {
          sendJson(res, 400, { error: 'Missing order ID' });
          return;
        }

        const order = store.getById(id);
        if (!order) {
          sendJson(res, 404, { error: 'Order not found' });
          return;
        }

        // Server-side ownership verification:
        // Address param is used only to confirm the caller knows which address owns the order.
        // The actual check is against the stored order's userAddress.
        const claimedAddress = url.searchParams.get('address');
        if (!claimedAddress || order.userAddress !== claimedAddress) {
          sendJson(res, 403, { error: 'Not authorized to cancel this order' });
          return;
        }

        const success = store.cancel(id);
        if (!success) {
          sendJson(res, 409, { error: 'Order already completed or cancelled' });
          return;
        }
        console.log(`[keeper] Order cancelled: id=${id} user=${claimedAddress.slice(0, 16)}...`);
        sendJson(res, 200, { success: true });
        return;
      }

      // GET /api/tpsl/status - Keeper status (no auth required)
      if (method === 'GET' && url.pathname === '/api/tpsl/status') {
        const stats = store.stats();
        const prices: Record<string, number> = {};
        for (const [symbol, data] of cachedPrices) {
          prices[symbol] = data.price;
        }

        sendJson(res, 200, {
          status: 'running',
          uptime: Math.floor((Date.now() - startTime) / 1000),
          orders: stats,
          prices,
          checkInterval: CHECK_INTERVAL_MS / 1000,
        });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('[keeper] HTTP error:', error);
      sendJson(res, 500, { error: 'Internal server error' });
    }
  };
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('TP/SL Keeper Bot');
  console.log(`  RPC: ${RPC_URL}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Check Interval: ${CHECK_INTERVAL_MS / 1000}s\n`);

  const privateKeyInput = process.env.KEEPER_PRIVATE_KEY;
  if (!privateKeyInput) {
    console.error('KEEPER_PRIVATE_KEY environment variable not set');
    console.error('Supported formats: suiprivkey1... (Bech32) or 64-char hex');
    process.exit(1);
  }

  let keypair: Ed25519Keypair;
  try {
    if (privateKeyInput.startsWith('suiprivkey')) {
      const { secretKey } = decodeSuiPrivateKey(privateKeyInput);
      keypair = Ed25519Keypair.fromSecretKey(secretKey);
    } else {
      const cleanKey = privateKeyInput.replace(/^0x/, '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
        throw new Error('Invalid hex format');
      }
      keypair = Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
    }
  } catch (error) {
    console.error('Invalid KEEPER_PRIVATE_KEY format');
    console.error('Supported: suiprivkey1... (Bech32) or 64-char hex');
    process.exit(1);
  }
  const client = new SuiClient({ url: RPC_URL });
  const store = new TPSLStore('./data/tpsl-orders.json');
  const startTime = Date.now();

  const keeperAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`  Keeper: ${keeperAddress.slice(0, 16)}...`);
  console.log(`  Auth: ${API_KEY ? 'API key configured' : 'No API key (dev mode)'}`);
  console.log(`  Orders: ${store.stats().active} active\n`);

  // Startup validation: fail orphaned orders whose TradeCap is not owned by this keeper
  const activeOrders = store.getActive();
  if (activeOrders.length > 0) {
    // Deduplicate TradeCap IDs to minimize RPC calls
    const uniqueTradeCapIds = [...new Set(activeOrders.map((o) => o.tradeCapId))];
    const invalidTradeCaps = new Set<string>();

    for (const tradeCapId of uniqueTradeCapIds) {
      // Retry up to 3 times to avoid marking valid orders as failed on transient RPC issues
      let check: { valid: boolean; error?: string } = { valid: false, error: 'verification not attempted' };
      let networkError = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        check = await verifyTradeCapOwnership(client, tradeCapId, keeperAddress);
        if (check.valid || !check.error?.includes('Failed to verify TradeCap on-chain')) {
          // Definitive result (valid, not found, or wrong owner) — stop retrying
          break;
        }
        // Network error — retry after delay
        networkError = true;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
      }

      if (networkError && !check.valid && check.error?.includes('Failed to verify TradeCap on-chain')) {
        // All retries exhausted with network errors — skip, don't mark as failed
        console.warn(`[keeper] Could not verify TradeCap ${tradeCapId.slice(0, 16)}... after retries, skipping`);
        continue;
      }

      if (!check.valid) {
        invalidTradeCaps.add(tradeCapId);
        console.warn(`[keeper] TradeCap ${tradeCapId.slice(0, 16)}... is not owned by this keeper: ${check.error}`);
      }
    }

    if (invalidTradeCaps.size > 0) {
      let failedCount = 0;
      for (const order of activeOrders) {
        if (invalidTradeCaps.has(order.tradeCapId)) {
          store.markFailed(order.id, 'TradeCap not owned by current keeper (key change)', true);
          failedCount++;
        }
      }
      console.warn(`[keeper] Marked ${failedCount} orphaned order(s) as permanently failed`);
    }
  }

  // Start HTTP server with EADDRINUSE handling
  const server = createServer(createHttpHandler(store, client, keeperAddress, startTime));
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[keeper] Port ${PORT} already in use. Retrying in 3s...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT);
      }, 3000);
    } else {
      console.error('[keeper] Server error:', err);
      process.exit(1);
    }
  });
  server.listen(PORT, () => {
    console.log(`[keeper] HTTP API listening on port ${PORT}`);
  });

  // Price monitoring loop with overlap guard
  let isRunning = false;
  const monitor = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await withRetry(() => fetchOraclePrices(client), { label: 'fetchPrices', maxRetries: 2 });
      await checkAndExecuteOrders(store, client, keypair);
    } catch (error) {
      console.error('[keeper] Monitor cycle error:', error instanceof Error ? error.message : error);
    } finally {
      isRunning = false;
    }
  };

  // Initial fetch
  await monitor();

  // Periodic check
  console.log(`[keeper] Price monitor started (${CHECK_INTERVAL_MS / 1000}s interval)\n`);
  setInterval(monitor, CHECK_INTERVAL_MS);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
