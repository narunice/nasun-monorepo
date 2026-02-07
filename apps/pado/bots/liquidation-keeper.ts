/**
 * Liquidation Keeper Bot
 *
 * Monitors perpetual positions and liquidates underwater ones.
 * Earns 5% liquidator bonus on successful liquidations.
 *
 * Usage:
 *   pnpm liquidation-keeper          # Run continuously
 *   pnpm liquidation-keeper:once     # Check once and exit
 *
 * Environment Variables:
 *   KEEPER_PRIVATE_KEY  - Hex-encoded private key for liquidator
 *   NASUN_RPC_URL       - RPC endpoint (default: https://rpc.devnet.nasun.io)
 *
 * @version 0.1.0
 */

import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { withRetry } from './lib/retry';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

// Contract addresses (Devnet - 2026-01-10)
const PERP_PACKAGE_ID = '0x4e2a36299ce4b17ecbd3c4049fa99aae77afeb193a0724c4ad738765072be2e5';
const ORACLE_PACKAGE_ID = '0x10ffe5c6fe47e6e046a0692863937d270708f4bf8f74c18aab578c97b862f84c';
const ORACLE_REGISTRY_ID = '0x023944875d36fe148facf696cc00b6c4a850074556890e547dcd61f5d8710b9b';
const CLOCK_ID = '0x6';

// Markets
const BTC_PERP_MARKET_ID = '0x0a3ba00cce5aae262ea48ca989dbdf9270addc06e796242f9c0189087c111ec2';

// Constants
const MAINTENANCE_MARGIN_BPS = 250; // 2.5%
const BPS = 10000;
const PRICE_DECIMALS = 100_000_000; // 8 decimals
const CHECK_INTERVAL_MS = 10_000; // 10 seconds

// Oracle symbols
const BTCUSD = 1;

// ========================================
// Types
// ========================================

interface PerpPosition {
  id: string;
  marketId: string;
  owner: string;
  isLong: boolean;
  size: bigint;
  entryPrice: bigint;
  collateral: bigint;
  leverage: number;
}

interface LiquidationResult {
  positionId: string;
  txDigest: string;
  bonus: bigint;
}

// ========================================
// Helpers
// ========================================

function fromContractPrice(price: bigint | number): number {
  return Number(price) / PRICE_DECIMALS;
}

function calculatePnL(
  position: PerpPosition,
  currentPrice: bigint
): { value: bigint; negative: boolean } {
  const notional = (position.size * position.entryPrice) / BigInt(PRICE_DECIMALS);
  const currentNotional = (position.size * currentPrice) / BigInt(PRICE_DECIMALS);

  if (position.isLong) {
    if (currentNotional >= notional) {
      return { value: currentNotional - notional, negative: false };
    } else {
      return { value: notional - currentNotional, negative: true };
    }
  } else {
    if (notional >= currentNotional) {
      return { value: notional - currentNotional, negative: false };
    } else {
      return { value: currentNotional - notional, negative: true };
    }
  }
}

function calculateMarginRatio(position: PerpPosition, currentPrice: bigint): number {
  const pnl = calculatePnL(position, currentPrice);
  const equity = pnl.negative
    ? Number(position.collateral) - Number(pnl.value)
    : Number(position.collateral) + Number(pnl.value);

  if (equity <= 0) return 0;

  const notional = Number(position.size * currentPrice / BigInt(PRICE_DECIMALS));
  return Math.floor((equity * BPS) / notional);
}

function isLiquidatable(position: PerpPosition, currentPrice: bigint): boolean {
  const marginRatio = calculateMarginRatio(position, currentPrice);
  return marginRatio < MAINTENANCE_MARGIN_BPS;
}

// ========================================
// On-chain Queries
// ========================================

async function fetchOraclePrice(client: SuiClient, symbolId: number): Promise<bigint> {
  const registry = await client.getObject({
    id: ORACLE_REGISTRY_ID,
    options: { showContent: true },
  });

  if (registry.data?.content?.dataType !== 'moveObject') {
    throw new Error('Failed to fetch oracle registry');
  }

  const fields = registry.data.content.fields as Record<string, unknown>;
  const pricesTable = fields.prices as { fields: { id: { id: string } } };

  // Query the dynamic field for the symbol
  const priceField = await client.getDynamicFieldObject({
    parentId: pricesTable.fields.id.id,
    name: { type: 'u64', value: symbolId.toString() },
  });

  if (priceField.data?.content?.dataType !== 'moveObject') {
    throw new Error(`Price not found for symbol ${symbolId}`);
  }

  const priceFields = priceField.data.content.fields as { value: { fields: { price: string } } };
  return BigInt(priceFields.value.fields.price);
}

async function fetchPositionsFromEvents(
  client: SuiClient,
  marketId: string
): Promise<string[]> {
  // Query PositionOpened events to find position IDs
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PERP_PACKAGE_ID}::perpetual::PositionOpened`,
    },
    limit: 100,
  });

  const positionIds: string[] = [];
  for (const event of events.data) {
    const parsedEvent = event.parsedJson as Record<string, unknown>;
    if (parsedEvent.market_id === marketId) {
      positionIds.push(parsedEvent.position_id as string);
    }
  }

  return positionIds;
}

async function fetchPosition(
  client: SuiClient,
  positionId: string
): Promise<PerpPosition | null> {
  try {
    const obj = await client.getObject({
      id: positionId,
      options: { showContent: true, showOwner: true },
    });

    if (obj.error || obj.data?.content?.dataType !== 'moveObject') {
      return null; // Position might be closed
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const collateralFields = fields.collateral as { fields: { balance: string } };

    return {
      id: positionId,
      marketId: fields.market_id as string,
      owner: (obj.data.owner as { AddressOwner: string }).AddressOwner,
      isLong: fields.is_long as boolean,
      size: BigInt(fields.size as string),
      entryPrice: BigInt(fields.entry_price as string),
      collateral: BigInt(collateralFields.fields.balance),
      leverage: Number(fields.leverage as string),
    };
  } catch {
    return null;
  }
}

// ========================================
// Liquidation Execution
// ========================================

async function liquidatePosition(
  client: SuiClient,
  keypair: Ed25519Keypair,
  position: PerpPosition,
): Promise<LiquidationResult> {
  const tx = new Transaction();

  // Call liquidate_position (reads price from on-chain oracle, not caller-provided)
  const bonusCoin = tx.moveCall({
    target: `${PERP_PACKAGE_ID}::liquidation::liquidate_position`,
    arguments: [
      tx.object(position.marketId), // market
      tx.object(position.id), // position (owned object)
      tx.object(ORACLE_REGISTRY_ID), // oracle registry (on-chain price read)
      tx.object(CLOCK_ID), // clock
    ],
  });

  // Transfer bonus to liquidator
  tx.transferObjects([bonusCoin], keypair.getPublicKey().toSuiAddress());

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showBalanceChanges: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`Liquidation failed: ${result.effects?.status?.error}`);
  }

  // Calculate bonus from balance changes
  let bonus = 0n;
  if (result.balanceChanges) {
    for (const change of result.balanceChanges) {
      if (
        change.owner === keypair.getPublicKey().toSuiAddress() &&
        change.coinType.includes('nusdc')
      ) {
        bonus = BigInt(change.amount);
      }
    }
  }

  return {
    positionId: position.id,
    txDigest: result.digest,
    bonus,
  };
}

// ========================================
// Main Loop
// ========================================

async function checkAndLiquidate(
  client: SuiClient,
  keypair: Ed25519Keypair,
  trackedPositions: Set<string>
): Promise<void> {
  const now = new Date().toISOString().slice(11, 19);

  // 1. Fetch current BTC price (with retry)
  let btcPrice: bigint;
  try {
    btcPrice = await withRetry(
      () => fetchOraclePrice(client, BTCUSD),
      { label: 'fetchOraclePrice' }
    );
  } catch (error) {
    console.log(`[${now}] ⚠️  Failed to fetch oracle price after retries, skipping...`);
    return;
  }

  console.log(`[${now}] 📊 BTC Price: $${fromContractPrice(btcPrice).toLocaleString()}`);

  // 2. Fetch new positions from events
  try {
    const newPositionIds = await fetchPositionsFromEvents(client, BTC_PERP_MARKET_ID);
    for (const id of newPositionIds) {
      trackedPositions.add(id);
    }
  } catch (error) {
    console.log(`[${now}] ⚠️  Failed to fetch events, using cached positions`);
  }

  // 3. Check each tracked position
  const closedPositions: string[] = [];
  let liquidatable = 0;
  let checked = 0;

  for (const positionId of trackedPositions) {
    const position = await fetchPosition(client, positionId);

    if (!position) {
      closedPositions.push(positionId);
      continue;
    }

    checked++;
    const marginRatio = calculateMarginRatio(position, btcPrice);

    if (isLiquidatable(position, btcPrice)) {
      liquidatable++;
      console.log(`[${now}] 🔴 Liquidatable: ${positionId.slice(0, 10)}... (margin: ${(marginRatio / 100).toFixed(2)}%)`);

      try {
        const result = await withRetry(
          () => liquidatePosition(client, keypair, position),
          { label: 'liquidatePosition', maxRetries: 2 }
        );
        const bonusFormatted = (Number(result.bonus) / 1_000_000).toFixed(2);
        console.log(`[${now}] ✅ Liquidated! Bonus: ${bonusFormatted} NUSDC (tx: ${result.txDigest.slice(0, 10)}...)`);
        closedPositions.push(positionId);
      } catch (error) {
        console.log(`[${now}] ❌ Liquidation failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  // 4. Clean up closed positions
  for (const id of closedPositions) {
    trackedPositions.delete(id);
  }

  if (checked > 0) {
    console.log(`[${now}] 📋 Checked ${checked} positions, ${liquidatable} liquidatable, ${closedPositions.length} closed`);
  }
}

async function main() {
  console.log('🤖 Perpetual Liquidation Keeper');
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Package: ${PERP_PACKAGE_ID.slice(0, 16)}...`);
  console.log(`   Market: ${BTC_PERP_MARKET_ID.slice(0, 16)}...`);
  console.log(`   Interval: ${CHECK_INTERVAL_MS / 1000}s\n`);

  // Get keeper key from environment
  const keeperKeyHex = process.env.KEEPER_PRIVATE_KEY;
  if (!keeperKeyHex) {
    console.error('❌ KEEPER_PRIVATE_KEY environment variable not set');
    console.log('   Export your keeper private key: export KEEPER_PRIVATE_KEY=<hex>');
    console.log('   You can get it from: sui keytool export --key-identity <alias>');
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(keeperKeyHex, 'hex'));
  const client = new SuiClient({ url: RPC_URL });

  console.log(`   Keeper: ${keypair.getPublicKey().toSuiAddress().slice(0, 16)}...\n`);

  const runOnce = process.argv.includes('--once');
  const trackedPositions = new Set<string>();

  // Run immediately
  await checkAndLiquidate(client, keypair, trackedPositions);

  if (runOnce) {
    console.log('\n✅ Single check complete');
    process.exit(0);
  }

  // Run periodically
  console.log(`\n⏰ Running every ${CHECK_INTERVAL_MS / 1000}s... (Ctrl+C to stop)\n`);
  setInterval(() => checkAndLiquidate(client, keypair, trackedPositions), CHECK_INTERVAL_MS);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
