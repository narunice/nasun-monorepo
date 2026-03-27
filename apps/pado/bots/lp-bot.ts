/**
 * Liquidity Provider Bot (Multi-Market)
 *
 * Automatically provides liquidity to a DeepBook V3 orderbook
 * by placing grid orders around the current market price.
 *
 * Supports NBTC/NUSDC, NETH/NUSDC, and NSOL/NUSDC markets.
 *
 * Usage:
 *   LP_MARKET=NBTC pnpm lp-bot          # Run NBTC market (default)
 *   LP_MARKET=NETH pnpm lp-bot          # Run NETH market
 *   LP_MARKET=NSOL pnpm lp-bot          # Run NSOL market
 *   pnpm lp-bot:once                    # Run once and exit
 *
 * Environment Variables:
 *   LP_PRIVATE_KEY           - Hex-encoded private key (required)
 *   LP_MARKET                - Market to trade (NBTC|NETH|NSOL, default: NBTC)
 *   NASUN_RPC_URL            - RPC endpoint (default: https://rpc.devnet.nasun.io)
 *   LP_SPREAD_BPS            - Base spread in bps (default: 30 = 0.3%)
 *   LP_ORDER_LEVELS          - Orders per side (default: 30)
 *   LP_ORDER_SIZE            - Base token per order (default: market-specific)
 *   LP_UPDATE_INTERVAL       - Update interval ms (default: 10000)
 *   LP_REQUOTE_THRESHOLD     - Re-quote threshold bps (default: 50)
 *
 * @version 0.2.0
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

import {
  RPC_URL,
  MARKET,
  loadConfig,
  type LPConfig,
  type BotState,
  type Inventory,
  rawToPrice,
  rawToQuantity,
  isGasExhaustedError,
  timestamp,
} from './lib/config.js';
import { fetchPrice, validatePrice } from './lib/price-source.js';
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
  getGasBalance,
  depositAllToBalanceManager,
} from './lib/balance-manager.js';
import { requestTokens, requestGas } from './lib/faucet.js';

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

  // Step 0: Ensure sufficient gas
  const gasBalance = await getGasBalance(client, address);
  if (gasBalance < config.gasRefillThreshold) {
    console.log(`[${timestamp()}] Low gas: ${gasBalance.toFixed(4)} NASUN, requesting from faucet...`);
    const gasSuccess = await requestGas(address);
    if (gasSuccess) {
      const newGas = await getGasBalance(client, address);
      console.log(`[${timestamp()}] Gas balance: ${newGas.toFixed(4)} NASUN`);
    } else {
      console.error(`[${timestamp()}] Gas faucet request failed, skipping cycle`);
      state.consecutiveFailures++;
      return;
    }
  }

  // Step 1: Fetch current price
  const price = await fetchPrice();

  // Step 2: Validate price
  if (!validatePrice(price, config.minPriceUsd, config.maxPriceUsd)) {
    console.error(`[${timestamp()}] Price out of bounds: $${price.toLocaleString()}`);
    state.consecutiveFailures++;
    return;
  }

  console.log(`[${timestamp()}] ${MARKET.name} price: $${price.toLocaleString()}`);

  // Step 3: Ensure BalanceManager exists
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

  // Step 4: Check inventory and refill if needed
  let inventory = await getBalanceManagerBalances(client, state.balanceManagerId);
  console.log(`[${timestamp()}] Inventory: ${inventory.base.toFixed(4)} ${MARKET.name}, ${inventory.quote.toLocaleString()} NUSDC`);

  if (state.justInitialized) {
    state.justInitialized = false;
    console.log(`[${timestamp()}] First run after init, waiting for RPC to index deposited tokens...`);
    return;
  }

  if (inventory.base < config.refillThresholdBase || inventory.quote < config.refillThresholdQuote) {
    console.log(`[${timestamp()}] Low inventory, attempting refill...`);

    // Try faucet (skips if LP_DISABLE_TOKEN_FAUCET=true)
    await requestTokens(client, keypair);

    // Always try depositing wallet tokens to BalanceManager
    // (tokens may come from faucet above OR from external watchdog/prefund script)
    await depositAllToBalanceManager(client, keypair, state.balanceManagerId);

    const newInventory = await getBalanceManagerBalances(client, state.balanceManagerId);
    console.log(`[${timestamp()}] New inventory: ${newInventory.base.toFixed(4)} ${MARKET.name}, ${newInventory.quote.toLocaleString()} NUSDC`);
    Object.assign(inventory, newInventory);
  }

  // Step 5: Query orderbook
  const fullOrderbook = await getFullOrderbookState(client);
  if (fullOrderbook.hasBids || fullOrderbook.hasAsks) {
    console.log(`[${timestamp()}] Orderbook: ${fullOrderbook.bids.length} bids, ${fullOrderbook.asks.length} asks`);
  }

  // Step 6: Arbitrage
  if (config.enableArbitrage) {
    const arbConfig: ArbitrageConfig = {
      enabled: config.enableArbitrage,
      minProfitBps: config.minArbitrageProfitBps,
      maxQuantity: config.maxArbitrageQuantity,
    };

    const opportunities = findArbitrageOpportunities(
      fullOrderbook.bids,
      fullOrderbook.asks,
      price,
      arbConfig,
    );

    if (opportunities.length > 0) {
      logArbitrageOpportunities(opportunities, price);

      const arbTx = buildArbitrageTrades(state.balanceManagerId, opportunities, state);
      const arbResult = await executeTransaction(client, keypair, arbTx);

      if (arbResult.success) {
        console.log(`[${timestamp()}] Arbitrage executed: ${opportunities.length} trades (tx: ${arbResult.digest?.slice(0, 10)}...)`);
        inventory = await getBalanceManagerBalances(client, state.balanceManagerId);
        console.log(`[${timestamp()}] Inventory after arb: ${inventory.base.toFixed(4)} ${MARKET.name}, ${inventory.quote.toLocaleString()} NUSDC`);
      } else {
        console.error(`[${timestamp()}] Arbitrage failed: ${arbResult.error}`);
      }
    }
  }

  // Step 7: Calculate new grid orders
  const orders = calculateOrders(price, config, inventory, fullOrderbook);
  const validOrders = validateOrders(orders, config, price);

  if (validOrders.length === 0) {
    console.error(`[${timestamp()}] No valid orders generated`);
    state.consecutiveFailures++;
    return;
  }

  let bids = validOrders.filter((o) => o.isBid);
  let asks = validOrders.filter((o) => !o.isBid);

  // Cap order count to available inventory to prevent withdraw_with_proof failures.
  // DeepBook V3 reserves maker fees upfront per order, so use 95% of balance as safe limit.
  const safeBase = inventory.base * 0.95;
  const safeQuote = inventory.quote * 0.95;
  const maxAsks = safeBase > 0
    ? Math.floor(safeBase / config.orderSize)
    : 0;
  const maxBids = (safeQuote > 0 && price > 0)
    ? Math.floor(safeQuote / (config.orderSize * price))
    : 0;

  if (maxAsks < asks.length || maxBids < bids.length) {
    bids = bids.slice(0, Math.max(0, maxBids));
    asks = asks.slice(0, Math.max(0, maxAsks));

    if (bids.length === 0 && asks.length === 0) {
      console.error(`[${timestamp()}] Insufficient inventory for any orders (base: ${inventory.base.toFixed(4)}, quote: ${inventory.quote.toFixed(0)})`);
      state.consecutiveFailures++;
      return;
    }

    console.log(`[${timestamp()}] Inventory limited: capped to ${bids.length} bids + ${asks.length} asks`);
  }

  const finalOrders = [...bids, ...asks];
  console.log(`[${timestamp()}] Generating ${bids.length} bids + ${asks.length} asks around $${price.toLocaleString()}`);

  // Step 8: Atomic cancel+place
  const result = await syncOrders(client, keypair, state.balanceManagerId, finalOrders, state);

  if (result.success) {
    state.lastQuotedPrice = price;
    state.consecutiveFailures = 0;

    const bestBid = bids.length > 0 ? rawToPrice(bids[0].price) : 0;
    const bestAsk = asks.length > 0 ? rawToPrice(asks[0].price) : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? ((bestAsk - bestBid) / price) * 100 : 0;
    console.log(`[${timestamp()}] Best bid: $${bestBid.toLocaleString()}, Best ask: $${bestAsk.toLocaleString()}, Spread: ${spread.toFixed(2)}%`);
  } else {
    if (result.error && isGasExhaustedError(result.error)) {
      console.log(`[${timestamp()}] Gas exhaustion during order sync, requesting refill...`);
      const gasSuccess = await requestGas(address);
      if (gasSuccess) {
        const newGas = await getGasBalance(client, address);
        console.log(`[${timestamp()}] Gas refilled: ${newGas.toFixed(4)} NASUN, will retry next cycle`);
        return;
      }
    }

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

  const gasBalance = await getGasBalance(client, address);
  console.log(`[${timestamp()}] Gas: ${gasBalance.toFixed(4)} NASUN`);

  if (gasBalance < config.gasRefillThreshold) {
    console.log(`[${timestamp()}] Low gas, requesting from faucet...`);
    const gasSuccess = await requestGas(address);
    if (!gasSuccess) {
      console.error(`[${timestamp()}] Gas faucet failed`);
      return false;
    }
    const newGas = await getGasBalance(client, address);
    console.log(`[${timestamp()}] Gas after faucet: ${newGas.toFixed(4)} NASUN`);
  }

  const walletBalance = await getWalletBalances(client, address);
  console.log(`[${timestamp()}] Wallet: ${walletBalance.base.toFixed(4)} ${MARKET.name}, ${walletBalance.quote.toLocaleString()} NUSDC`);

  state.balanceManagerId = await findBalanceManager(client, address);

  if (!state.balanceManagerId) {
    console.log(`[${timestamp()}] No BalanceManager found, creating one...`);

    // Retry with backoff for transient gas coin contention
    for (let attempt = 1; attempt <= 3; attempt++) {
      state.balanceManagerId = await createBalanceManager(client, keypair);
      if (state.balanceManagerId) break;

      if (attempt < 3) {
        const waitSec = attempt * 5;
        console.log(`[${timestamp()}] Retrying BalanceManager creation in ${waitSec}s (attempt ${attempt}/3)...`);
        await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
      }
    }

    if (!state.balanceManagerId) {
      console.error(`[${timestamp()}] Failed to create BalanceManager after 3 attempts`);
      return false;
    }
  } else {
    console.log(`[${timestamp()}] Found BalanceManager: ${state.balanceManagerId.slice(0, 16)}...`);
  }

  const bmBalance = await getBalanceManagerBalances(client, state.balanceManagerId);
  console.log(`[${timestamp()}] BalanceManager: ${bmBalance.base.toFixed(4)} ${MARKET.name}, ${bmBalance.quote.toLocaleString()} NUSDC`);

  const totalBase = walletBalance.base + bmBalance.base;
  const totalQuote = walletBalance.quote + bmBalance.quote;

  // Calculate minimum inventory needed for the full order grid (20% buffer for maker fees)
  const minBaseNeeded = config.orderSize * config.orderLevels * 1.2;
  const minQuoteNeeded = config.refillThresholdQuote;

  if (totalBase < minBaseNeeded || totalQuote < minQuoteNeeded) {
    const deficit = Math.max(0, minBaseNeeded - totalBase);
    const faucetRounds = Math.min(
      Math.max(1, Math.ceil(deficit / MARKET.faucetBaseAmount)),
      30, // Max 30 faucet calls for 10x liquidity accumulation
    );
    console.log(`[${timestamp()}] Insufficient funds (have ${totalBase.toFixed(4)}, need ~${minBaseNeeded.toFixed(4)} ${MARKET.name}), accumulating via faucet (${faucetRounds} rounds)...`);

    let faucetFailures = 0;
    for (let i = 0; i < faucetRounds; i++) {
      const faucetSuccess = await requestTokens(client, keypair);
      if (!faucetSuccess) {
        faucetFailures++;
        if (faucetFailures >= 2) break; // Give up after 2 consecutive failures
        console.log(`[${timestamp()}] Faucet round ${i + 1} failed, retrying in 5s...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      faucetFailures = 0;
    }

    const newWalletBalance = await getWalletBalances(client, address);
    console.log(`[${timestamp()}] Wallet after faucet: ${newWalletBalance.base.toFixed(4)} ${MARKET.name}, ${newWalletBalance.quote.toLocaleString()} NUSDC`);

    if (newWalletBalance.base > 0 || newWalletBalance.quote > 0) {
      console.log(`[${timestamp()}] Depositing faucet tokens to BalanceManager...`);
      await depositAllToBalanceManager(client, keypair, state.balanceManagerId);
      state.justInitialized = true;
    }
  } else if (walletBalance.base > 0 || walletBalance.quote > 0) {
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
  console.log(`   LP Bot - ${MARKET.name}/NUSDC Liquidity Provider`);
  console.log('=================================================');
  console.log('');

  const config = loadConfig();
  console.log(`[${timestamp()}] Configuration:`);
  console.log(`   Market: ${MARKET.name}/NUSDC`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Spread: ${config.spreadBps}bps (${(config.spreadBps / 100).toFixed(2)}%)`);
  console.log(`   Levels: ${config.orderLevels} per side`);
  console.log(`   Order size: ${config.orderSize} ${MARKET.name}`);
  console.log(`   Price range: $${config.minPriceUsd.toLocaleString()} - $${config.maxPriceUsd.toLocaleString()}`);
  console.log(`   Interval: ${config.updateIntervalMs / 1000}s`);
  console.log(`   Arbitrage: ${config.enableArbitrage ? 'enabled' : 'disabled'}`);
  if (config.enableArbitrage) {
    console.log(`   Min arb profit: ${config.minArbitrageProfitBps}bps`);
    console.log(`   Max arb size: ${config.maxArbitrageQuantity} ${MARKET.name}`);
  }
  console.log('');

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
    console.error('Invalid private key format');
    console.error('Supported: suiprivkey1... (Bech32) or 64-char hex');
    process.exit(1);
  }
  const client = new SuiClient({ url: RPC_URL });
  const address = keypair.getPublicKey().toSuiAddress();

  console.log(`[${timestamp()}] Bot address: ${address.slice(0, 16)}...`);
  console.log('');

  // Stagger bot startup to avoid gas coin contention when running multiple bots
  if (MARKET.startupDelayMs > 0) {
    console.log(`[${timestamp()}] Waiting ${MARKET.startupDelayMs / 1000}s before starting (staggered startup)...`);
    await new Promise((resolve) => setTimeout(resolve, MARKET.startupDelayMs));
  }

  const state: BotState = {
    lastQuotedPrice: 0,
    consecutiveFailures: 0,
    clientOrderIdCounter: BigInt(Date.now()),
    balanceManagerId: null,
    justInitialized: false,
  };

  const initSuccess = await initialize(client, keypair, config, state);
  if (!initSuccess) {
    console.error(`[${timestamp()}] Initialization failed`);
    process.exit(1);
  }

  const runOnce = process.argv.includes('--once');

  const runCycle = async () => {
    // Circuit breaker with auto-recovery (cooldown instead of permanent pause)
    if (state.consecutiveFailures >= config.maxConsecutiveFailures) {
      const cooldownMs = Math.min(
        60000,
        config.updateIntervalMs * (state.consecutiveFailures - config.maxConsecutiveFailures + 1),
      );
      console.log(`[${timestamp()}] Circuit breaker: ${state.consecutiveFailures} failures, cooling down ${cooldownMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, cooldownMs));
      console.log(`[${timestamp()}] Circuit breaker: attempting recovery...`);
    }

    try {
      await runBot(client, keypair, config, state);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Error:`, msg);

      if (isGasExhaustedError(msg)) {
        console.log(`[${timestamp()}] Gas exhaustion detected, requesting refill...`);
        const gasSuccess = await requestGas(address);
        if (gasSuccess) {
          const newGas = await getGasBalance(client, address);
          console.log(`[${timestamp()}] Gas refilled: ${newGas.toFixed(4)} NASUN, will retry next cycle`);
          return;
        }
      }

      state.consecutiveFailures++;
    }
  };

  await runCycle();

  if (runOnce) {
    console.log('');
    console.log(`[${timestamp()}] Single run complete`);
    process.exit(0);
  }

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

  console.log('');
  console.log(`[${timestamp()}] Running every ${config.updateIntervalMs / 1000}s... (Ctrl+C to stop)`);
  console.log('');

  // Use setTimeout loop instead of setInterval to prevent concurrent execution
  // and naturally stagger timing across bot processes (each cycle starts only
  // after the previous one completes + interval delay)
  const loop = async () => {
    await runCycle();
    setTimeout(loop, config.updateIntervalMs);
  };
  setTimeout(loop, config.updateIntervalMs);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
