/**
 * TP/SL Keeper Bot
 *
 * Server-side TP/SL order execution service.
 * Monitors oracle prices and triggers market orders via delegated TradeCap.
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
 *   TPSL_API_KEY          - API key for client authentication
 *   TPSL_ALLOWED_ORIGIN   - CORS allowed origin (default: https://pado.finance)
 *
 * @version 0.2.0
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { TPSLStore, type TPSLOrder } from './lib/tpsl-store';
import { executeMarketOrder, type ExecuteParams } from './lib/tpsl-executor';
import { withRetry } from './lib/retry';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const PORT = parseInt(process.env.TPSL_PORT || '4001');
const CHECK_INTERVAL_MS = 10_000; // 10 seconds
const ORACLE_REGISTRY_ID = process.env.ORACLE_REGISTRY_ID || '';
const ORACLE_PACKAGE_ID = process.env.ORACLE_PACKAGE_ID || '';
const DEEPBOOK_PACKAGE = process.env.DEEPBOOK_PACKAGE || '';
const API_KEY = process.env.TPSL_API_KEY || '';
const ALLOWED_ORIGIN = process.env.TPSL_ALLOWED_ORIGIN || 'https://pado.finance';
const MAX_BODY_SIZE = 10_000; // 10KB max request body
const MAX_ORDERS_PER_USER = 50;
const PRICE_STALENESS_MS = 60_000; // 60 seconds (reduced from 120s for financial safety)
const SUI_OBJECT_ID_REGEX = /^0x[a-f0-9]{64}$/;

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
    const feedsTableId = (fields['feeds'] as Record<string, string>)?.['fields']?.['id']?.['id'];

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
          const value = feedFields['value'] as Record<string, unknown>;
          if (value) {
            const rawPrice = BigInt(String(value['price'] || 0));
            const price = Number(rawPrice) / Math.pow(10, DECIMALS);
            const timestamp = Number(BigInt(String(value['timestamp'] || 0)));

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
        store.markFailed(order.id, result.error || 'Unknown error');
        console.error(`[keeper] Order ${order.id} execution failed: ${result.error}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // TradeCap deleted or gas issues are permanent failures
      const permanent = msg.includes('ObjectNotFound') || msg.includes('deleted');
      store.markFailed(order.id, msg, permanent);
      console.error(`[keeper] Order ${order.id} error (permanent=${permanent}): ${msg}`);
    }
  }
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
  const types: Record<string, string> = {
    NBTC: process.env.NBTC_TYPE || '',
    NETH: process.env.NETH_TYPE || '',
    NSOL: process.env.NSOL_TYPE || '',
    NASUN: '0x2::sui::SUI',
  };
  return types[symbol] || '';
}

function getQuoteType(): string {
  return process.env.NUSDC_TYPE || '';
}

function getBaseMultiplier(symbol: string): number {
  const decimals: Record<string, number> = {
    NBTC: 8,
    NETH: 18,
    NSOL: 9,
    NASUN: 9,
  };
  return Math.pow(10, decimals[symbol] || 9);
}

// ========================================
// HTTP API
// ========================================

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

// Authenticate request via API key
function authenticateRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!API_KEY) return true; // Skip auth if no key configured (dev mode)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${API_KEY}`) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Validate Sui object ID format
function isValidObjectId(id: string): boolean {
  return SUI_OBJECT_ID_REGEX.test(id);
}

function createHttpHandler(store: TPSLStore, startTime: number) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const method = req.method?.toUpperCase() || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      sendJson(res, 204, null);
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

        // Per-user order limit
        const userOrders = store.getByUser(userAddress);
        if (userOrders.length >= MAX_ORDERS_PER_USER) {
          sendJson(res, 429, { error: `Maximum ${MAX_ORDERS_PER_USER} active orders per user` });
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

      // DELETE /api/tpsl/orders/:id - Cancel order (with ownership check)
      if (method === 'DELETE' && url.pathname.startsWith('/api/tpsl/orders/')) {
        if (!authenticateRequest(req, res)) return;

        const id = url.pathname.split('/').pop();
        if (!id) {
          sendJson(res, 400, { error: 'Missing order ID' });
          return;
        }

        // Verify ownership via userAddress query param
        const ownerAddress = url.searchParams.get('address');
        if (!ownerAddress) {
          sendJson(res, 400, { error: 'Missing address parameter for ownership verification' });
          return;
        }

        const order = store.getById(id);
        if (!order) {
          sendJson(res, 404, { error: 'Order not found' });
          return;
        }
        if (order.userAddress !== ownerAddress) {
          sendJson(res, 403, { error: 'Not authorized to cancel this order' });
          return;
        }

        const success = store.cancel(id);
        if (!success) {
          sendJson(res, 409, { error: 'Order already completed or cancelled' });
          return;
        }
        sendJson(res, 200, { success: true });
        return;
      }

      // GET /api/tpsl/status - Keeper status
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

  const keeperKeyHex = process.env.KEEPER_PRIVATE_KEY;
  if (!keeperKeyHex) {
    console.error('KEEPER_PRIVATE_KEY environment variable not set');
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(keeperKeyHex, 'hex'));
  const client = new SuiClient({ url: RPC_URL });
  const store = new TPSLStore('./data/tpsl-orders.json');
  const startTime = Date.now();

  console.log(`  Keeper: ${keypair.getPublicKey().toSuiAddress().slice(0, 16)}...`);
  console.log(`  Orders: ${store.stats().active} active\n`);

  // Start HTTP server
  const server = createServer(createHttpHandler(store, startTime));
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
