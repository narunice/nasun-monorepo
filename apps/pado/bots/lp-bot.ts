/**
 * Liquidity Provider Bot
 *
 * Automatically provides liquidity to the NBTC/NUSDC orderbook
 * by placing grid orders around the current BTC price.
 *
 * Usage:
 *   pnpm lp-bot              # Run continuously (10s interval)
 *   pnpm lp-bot:once         # Run once and exit
 *
 * Environment Variables:
 *   LP_PRIVATE_KEY           - Hex-encoded private key (required)
 *   NASUN_RPC_URL            - RPC endpoint (default: https://rpc.devnet.nasun.io)
 *   LP_SPREAD_BPS            - Base spread in bps (default: 30 = 0.3%)
 *   LP_ORDER_LEVELS          - Orders per side (default: 5)
 *   LP_ORDER_SIZE            - BTC per order (default: 0.01)
 *   LP_UPDATE_INTERVAL       - Update interval ms (default: 10000)
 *   LP_REQUOTE_THRESHOLD     - Re-quote threshold bps (default: 50)
 *
 * @version 0.1.0
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

import {
  RPC_URL,
  loadConfig,
  type LPConfig,
  type BotState,
  type Inventory,
  rawToPrice,
  rawToQuantity,
  timestamp,
} from './lib/config.js';
import { fetchBtcPrice, validatePrice } from './lib/price-source.js';
import { calculateOrders, validateOrders } from './lib/strategy.js';
import { syncOrders, buildCancelAllOrders, executeTransaction } from './lib/order-manager.js';
import { getFullOrderbookState } from './lib/orderbook.js';
import {
  findArbitrageOpportunities,
  buildArbitrageTrades,
  logArbitrageOpportunities,
  type ArbitrageConfig,
} from './lib/arbitrage.js';
import {
  findBalanceManager,
  createBalanceManager,
  getBalanceManagerBalances,
  getWalletBalances,
  depositAllToBalanceManager,
} from './lib/balance-manager.js';
import { requestTokens } from './lib/faucet.js';

// ========================================
// Main Bot Logic
// ========================================

async function runBot(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: LPConfig,
  state: BotState,
): Promise<void> {
  const address = keypair.getPublicKey().toSuiAddress();

  // Step 1: Fetch current BTC price
  const btcPrice = await fetchBtcPrice();

  // Step 2: Validate price
  if (!validatePrice(btcPrice, config.minPriceUsd, config.maxPriceUsd)) {
    console.error(`[${timestamp()}] Price out of bounds: $${btcPrice.toLocaleString()}`);
    state.consecutiveFailures++;
    return;
  }

  // Log current price (always refresh orders every cycle)
  console.log(`[${timestamp()}] BTC price: $${btcPrice.toLocaleString()}`);

  // Step 4: Ensure BalanceManager exists
  if (!state.balanceManagerId) {
    console.log(`[${timestamp()}] Looking for BalanceManager...`);
    state.balanceManagerId = await findBalanceManager(client, address);

    if (!state.balanceManagerId) {
      console.log(`[${timestamp()}] Creating new BalanceManager...`);
      state.balanceManagerId = await createBalanceManager(client, keypair);

      if (!state.balanceManagerId) {
        console.error(`[${timestamp()}] Failed to create BalanceManager`);
        state.consecutiveFailures++;
        return;
      }
    }
  }

  // Step 5: Check inventory and refill if needed
  let inventory = await getBalanceManagerBalances(client, state.balanceManagerId);
  console.log(`[${timestamp()}] Inventory: ${inventory.nbtc.toFixed(4)} NBTC, ${inventory.nusdc.toLocaleString()} NUSDC`);

  // Skip entire cycle on first run after initialization (RPC indexing lag)
  // The BalanceManager won't have indexed balances yet, so orders would fail
  if (state.justInitialized) {
    state.justInitialized = false;
    console.log(`[${timestamp()}] First run after init, waiting for RPC to index deposited tokens...`);
    console.log(`[${timestamp()}] Orders will be placed on next cycle`);
    return;
  }

  // Check if we need to refill from faucet
  if (inventory.nbtc < config.refillThresholdNbtc || inventory.nusdc < config.refillThresholdNusdc) {
    console.log(`[${timestamp()}] Low inventory, requesting tokens from faucet...`);

    // Request faucet
    const faucetSuccess = await requestTokens(client, keypair);
    if (faucetSuccess) {
      // Deposit new tokens to BalanceManager
      await depositAllToBalanceManager(client, keypair, state.balanceManagerId);

      // Re-fetch inventory
      const newInventory = await getBalanceManagerBalances(client, state.balanceManagerId);
      console.log(`[${timestamp()}] New inventory: ${newInventory.nbtc.toFixed(4)} NBTC, ${newInventory.nusdc.toLocaleString()} NUSDC`);

      // Update inventory for order calculation
      Object.assign(inventory, newInventory);
    }
  }

  // Step 6: Query orderbook (with bot orders still present)
  const fullOrderbook = await getFullOrderbookState(client);
  if (fullOrderbook.hasBids || fullOrderbook.hasAsks) {
    console.log(`[${timestamp()}] Orderbook: ${fullOrderbook.bids.length} bids, ${fullOrderbook.asks.length} asks`);
  }

  // Step 7: Find and execute arbitrage opportunities
  // Bot orders remain on book; IOC + CANCEL_TAKER prevents self-matching
  if (config.enableArbitrage) {
    const arbConfig: ArbitrageConfig = {
      enabled: config.enableArbitrage,
      minProfitBps: config.minArbitrageProfitBps,
      maxQuantityNbtc: config.maxArbitrageQuantityNbtc,
    };

    const opportunities = findArbitrageOpportunities(
      fullOrderbook.bids,
      fullOrderbook.asks,
      btcPrice,
      arbConfig,
    );

    if (opportunities.length > 0) {
      logArbitrageOpportunities(opportunities, btcPrice);

      const arbTx = buildArbitrageTrades(state.balanceManagerId, opportunities, state);
      const arbResult = await executeTransaction(client, keypair, arbTx);

      if (arbResult.success) {
        console.log(`[${timestamp()}] Arbitrage executed: ${opportunities.length} trades (tx: ${arbResult.digest?.slice(0, 10)}...)`);

        // Re-fetch inventory after arbitrage
        inventory = await getBalanceManagerBalances(client, state.balanceManagerId);
        console.log(`[${timestamp()}] Inventory after arb: ${inventory.nbtc.toFixed(4)} NBTC, ${inventory.nusdc.toLocaleString()} NUSDC`);
      } else {
        console.error(`[${timestamp()}] Arbitrage failed: ${arbResult.error}`);
      }
    }
  }

  // Step 8: Calculate new grid orders (reuse fullOrderbook for bestBid/bestAsk)
  const orders = calculateOrders(btcPrice, config, inventory, fullOrderbook);
  const validOrders = validateOrders(orders, config, btcPrice);

  if (validOrders.length === 0) {
    console.error(`[${timestamp()}] No valid orders generated`);
    state.consecutiveFailures++;
    return;
  }

  // Log order summary
  const bids = validOrders.filter((o) => o.isBid);
  const asks = validOrders.filter((o) => !o.isBid);
  console.log(`[${timestamp()}] Generating ${bids.length} bids + ${asks.length} asks around $${btcPrice.toLocaleString()}`);

  // Step 9: Atomic cancel+place (single PTB — no empty orderbook window)
  const result = await syncOrders(client, keypair, state.balanceManagerId, validOrders, state);

  if (result.success) {
    state.lastQuotedPrice = btcPrice;
    state.consecutiveFailures = 0;

    const bestBid = bids.length > 0 ? rawToPrice(bids[0].price) : 0;
    const bestAsk = asks.length > 0 ? rawToPrice(asks[0].price) : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? ((bestAsk - bestBid) / btcPrice) * 100 : 0;
    console.log(`[${timestamp()}] Best bid: $${bestBid.toLocaleString()}, Best ask: $${bestAsk.toLocaleString()}, Spread: ${spread.toFixed(2)}%`);
  } else {
    console.error(`[${timestamp()}] Failed to sync orders: ${result.error}`);
    state.consecutiveFailures++;
  }
}

// ========================================
// Initialization
// ========================================

async function initialize(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: LPConfig,
  state: BotState,
): Promise<boolean> {
  const address = keypair.getPublicKey().toSuiAddress();

  console.log(`[${timestamp()}] Checking initial state...`);

  // Check wallet balances
  const walletBalance = await getWalletBalances(client, address);
  console.log(`[${timestamp()}] Wallet: ${walletBalance.nbtc.toFixed(4)} NBTC, ${walletBalance.nusdc.toLocaleString()} NUSDC`);

  // Find or create BalanceManager
  state.balanceManagerId = await findBalanceManager(client, address);

  if (!state.balanceManagerId) {
    console.log(`[${timestamp()}] No BalanceManager found, creating one...`);
    state.balanceManagerId = await createBalanceManager(client, keypair);

    if (!state.balanceManagerId) {
      console.error(`[${timestamp()}] Failed to create BalanceManager`);
      return false;
    }
  } else {
    console.log(`[${timestamp()}] Found BalanceManager: ${state.balanceManagerId.slice(0, 16)}...`);
  }

  // Check BalanceManager balances
  const bmBalance = await getBalanceManagerBalances(client, state.balanceManagerId);
  console.log(`[${timestamp()}] BalanceManager: ${bmBalance.nbtc.toFixed(4)} NBTC, ${bmBalance.nusdc.toLocaleString()} NUSDC`);

  // If BalanceManager is empty, request faucet and deposit
  const totalNbtc = walletBalance.nbtc + bmBalance.nbtc;
  const totalNusdc = walletBalance.nusdc + bmBalance.nusdc;

  if (totalNbtc < config.refillThresholdNbtc || totalNusdc < config.refillThresholdNusdc) {
    console.log(`[${timestamp()}] Insufficient funds, requesting from faucet...`);
    const faucetSuccess = await requestTokens(client, keypair);

    if (faucetSuccess) {
      // Re-query wallet balance after faucet
      const newWalletBalance = await getWalletBalances(client, address);
      console.log(`[${timestamp()}] Wallet after faucet: ${newWalletBalance.nbtc.toFixed(4)} NBTC, ${newWalletBalance.nusdc.toLocaleString()} NUSDC`);

      // Deposit faucet tokens
      if (newWalletBalance.nbtc > 0 || newWalletBalance.nusdc > 0) {
        console.log(`[${timestamp()}] Depositing faucet tokens to BalanceManager...`);
        await depositAllToBalanceManager(client, keypair, state.balanceManagerId);
        state.justInitialized = true;
      }
    }
  } else if (walletBalance.nbtc > 0 || walletBalance.nusdc > 0) {
    // Deposit existing wallet tokens to BalanceManager
    console.log(`[${timestamp()}] Depositing wallet tokens to BalanceManager...`);
    await depositAllToBalanceManager(client, keypair, state.balanceManagerId);
    state.justInitialized = true;
  }

  return true;
}

// ========================================
// Main Entry Point
// ========================================

async function main() {
  console.log('');
  console.log('=================================================');
  console.log('   LP Bot - NBTC/NUSDC Liquidity Provider');
  console.log('=================================================');
  console.log('');

  // Load configuration
  const config = loadConfig();
  console.log(`[${timestamp()}] Configuration:`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Spread: ${config.spreadBps}bps (${(config.spreadBps / 100).toFixed(2)}%)`);
  console.log(`   Levels: ${config.orderLevels} per side`);
  console.log(`   Order size: ${config.orderSizeNbtc} BTC`);
  console.log(`   Interval: ${config.updateIntervalMs / 1000}s`);
  console.log(`   Arbitrage: ${config.enableArbitrage ? 'enabled' : 'disabled'}`);
  if (config.enableArbitrage) {
    console.log(`   Min arb profit: ${config.minArbitrageProfitBps}bps`);
    console.log(`   Max arb size: ${config.maxArbitrageQuantityNbtc} BTC`);
  }
  console.log('');

  // Load and validate private key
  const privateKeyInput = process.env.LP_PRIVATE_KEY;
  if (!privateKeyInput) {
    console.error('LP_PRIVATE_KEY environment variable not set');
    console.log('');
    console.log('Set your private key securely:');
    console.log('  Use a .env file (never commit to git)');
    console.log('  Or: export LP_PRIVATE_KEY=<key>');
    console.log('');
    console.log('Supported formats:');
    console.log('  - Bech32: suiprivkey1qq...');
    console.log('  - Hex: 64-character hex string');
    console.log('');
    console.log('Get it from: sui keytool export --key-identity <alias>');
    console.log('');
    console.log('CAUTION: Avoid typing secrets directly in terminal (shell history exposure)');
    process.exit(1);
  }

  // Create keypair - supports both Bech32 (suiprivkey1...) and hex formats
  let keypair: Ed25519Keypair;
  try {
    if (privateKeyInput.startsWith('suiprivkey')) {
      // Bech32 format (sui keytool export default output)
      const { secretKey } = decodeSuiPrivateKey(privateKeyInput);
      keypair = Ed25519Keypair.fromSecretKey(secretKey);
    } else {
      // Hex format
      const cleanKey = privateKeyInput.replace(/^0x/, '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
        throw new Error('Invalid hex format');
      }
      keypair = Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
    }
  } catch (error) {
    console.error('Invalid private key format');
    console.error('Supported: suiprivkey1... (Bech32) or 64-char hex');
    process.exit(1);
  }
  const client = new SuiClient({ url: RPC_URL });
  const address = keypair.getPublicKey().toSuiAddress();

  console.log(`[${timestamp()}] Bot address: ${address.slice(0, 16)}...`);
  console.log('');

  // Initialize state
  const state: BotState = {
    lastQuotedPrice: 0,
    consecutiveFailures: 0,
    clientOrderIdCounter: BigInt(Date.now()),
    balanceManagerId: null,
    justInitialized: false,
  };

  // Run initialization
  const initSuccess = await initialize(client, keypair, config, state);
  if (!initSuccess) {
    console.error(`[${timestamp()}] Initialization failed`);
    process.exit(1);
  }

  // Check for --once flag
  const runOnce = process.argv.includes('--once');

  // Main bot loop
  const update = async () => {
    // Circuit breaker check
    if (state.consecutiveFailures >= config.maxConsecutiveFailures) {
      console.error(`[${timestamp()}] Circuit breaker: ${state.consecutiveFailures} consecutive failures`);
      console.error(`[${timestamp()}] Bot paused. Restart to continue.`);
      return;
    }

    try {
      await runBot(client, keypair, config, state);
    } catch (error) {
      console.error(`[${timestamp()}] Error:`, error instanceof Error ? error.message : error);
      state.consecutiveFailures++;
    }
  };

  // Run immediately
  await update();

  if (runOnce) {
    console.log('');
    console.log(`[${timestamp()}] Single run complete`);
    process.exit(0);
  }

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log('');
    console.log(`[${timestamp()}] Received ${signal}, shutting down...`);

    if (state.balanceManagerId) {
      console.log(`[${timestamp()}] Canceling all orders...`);
      try {
        const tx = buildCancelAllOrders(state.balanceManagerId);
        await executeTransaction(client, keypair, tx);
        console.log(`[${timestamp()}] Orders canceled`);
      } catch (error) {
        console.error(`[${timestamp()}] Failed to cancel orders:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`[${timestamp()}] Shutdown complete`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Run periodically
  console.log('');
  console.log(`[${timestamp()}] Running every ${config.updateIntervalMs / 1000}s... (Ctrl+C to stop)`);
  console.log('');

  setInterval(update, config.updateIntervalMs);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
