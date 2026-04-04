/**
 * Lottery Keeper Bot
 *
 * Fully automates the weekly lottery lifecycle:
 *   SETTLED/none -> create_round + transfer_rollover
 *   OPEN         -> wait for closeTime, then close_round_permissionless
 *   CLOSED       -> wait for drawTime, then draw_numbers_permissionless
 *   DRAWN        -> count winners off-chain, then settle_round
 *
 * Stateless design: reads on-chain round status each tick.
 * No local state file -- the chain is the single source of truth.
 *
 * Env vars:
 *   LOTTERY_ADMIN_KEY       - Private key (hex or suiprivkey) that owns AdminCap
 *   NASUN_RPC_URL           - RPC endpoint (default: https://rpc.devnet.nasun.io)
 *   LOTTERY_PACKAGE_ID      - Override for upgraded package
 *   LOTTERY_CHECK_INTERVAL_MS - Base polling interval (default: 60000)
 *
 * Usage:
 *   node --env-file=.env --import tsx lottery-keeper.ts
 *   node --env-file=.env --import tsx lottery-keeper.ts --once
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { withRetry } from './lib/retry.js';
import {
  RPC_URL,
  LOTTERY_ADMIN_CAP_ID,
  ROUND_STATUS,
  timestamp,
  fetchLatestRound,
  countWinners,
  calculateNextRoundTimes,
  requestGas,
  buildCloseRoundPermissionlessTx,
  buildDrawNumbersPermissionlessTx,
  buildSettleRoundTx,
  buildCreateRoundTx,
  buildTransferRolloverTx,
  type LotteryRound,
} from './lib/lottery-config.js';

// ========================================
// Configuration
// ========================================

const GAS_REFILL_THRESHOLD = 0.3; // NASUN
const MAX_CONSECUTIVE_ERRORS = 10;
const EVENT_COUNT_RETRY_DELAY_MS = 30_000;
const MAX_EVENT_COUNT_RETRIES = 5;

// ========================================
// Parse keypair (dual format: hex + suiprivkey)
// ========================================

function parseKeypair(keyInput: string): Ed25519Keypair {
  if (keyInput.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(keyInput);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const cleanKey = keyInput.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key format (expected 64 hex chars or suiprivkey bech32)');
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
}

// ========================================
// Transaction execution with wait-for-finality
// ========================================

async function executeAndWait(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: import('@mysten/sui/transactions').Transaction,
  label: string,
): Promise<{ digest: string; effects: any }> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`${label} TX failed: ${result.effects?.status?.error || 'unknown'}`);
  }

  console.log(`[${timestamp()}] ${label} TX: ${result.digest}`);

  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest, effects: result };
}

// ========================================
// Gas balance check
// ========================================

async function getGasBalance(client: SuiClient, address: string): Promise<number> {
  const balance = await client.getBalance({ owner: address });
  return Number(balance.totalBalance) / 1e9;
}

async function ensureGas(client: SuiClient, address: string): Promise<void> {
  const balance = await getGasBalance(client, address);
  if (balance < GAS_REFILL_THRESHOLD) {
    console.log(`[${timestamp()}] Gas low (${balance.toFixed(4)} NASUN), requesting refill...`);
    await requestGas(address);
  }
}

// ========================================
// Parse new round ID from TX result
// ========================================

function parseNewRoundId(result: any): string | null {
  const changes = result.effects?.objectChanges;
  if (!Array.isArray(changes)) return null;

  for (const change of changes) {
    if (
      change.type === 'created' &&
      change.objectType?.includes('::lottery::LotteryRound')
    ) {
      return change.objectId;
    }
  }
  return null;
}

// ========================================
// Adaptive polling interval
// ========================================

function getNextInterval(round: LotteryRound | null): number {
  // Immediate actions: process as fast as possible
  if (!round || round.status === ROUND_STATUS.SETTLED) return 10_000;
  if (round.status === ROUND_STATUS.DRAWN) return 10_000;

  // Deadline-driven: calculate time until next event
  const nextEvent =
    round.status === ROUND_STATUS.OPEN ? round.closeTime : round.drawTime;
  const timeUntil = nextEvent - Date.now();

  if (timeUntil <= 60_000) return 10_000; // <1min: 10s
  if (timeUntil <= 3_600_000) return 60_000; // <1hr: 60s
  return 600_000; // Otherwise: 10min
}

// ========================================
// Main tick (stateless check-and-advance)
// ========================================

let isRunning = false;
let consecutiveErrors = 0;
let shuttingDown = false;

async function tick(client: SuiClient, keypair: Ed25519Keypair): Promise<LotteryRound | null> {
  if (isRunning || shuttingDown) return null;
  isRunning = true;

  let round: LotteryRound | null = null;

  try {
    await ensureGas(client, keypair.toSuiAddress());
    round = await fetchLatestRound(client);

    const statusLabel = round
      ? ['OPEN', 'CLOSED', 'DRAWN', 'SETTLED'][round.status] || String(round.status)
      : 'NO_ROUND';
    console.log(
      `[${timestamp()}] Round: ${round?.roundNumber ?? '-'} | Status: ${statusLabel}` +
        (round ? ` | Pool: ${(Number(round.prizePool) / 1e6).toFixed(2)} NUSDC | Tickets: ${round.ticketCount}` : ''),
    );

    // Case 1: No round or SETTLED -> create next round + transfer rollover
    if (!round || round.status === ROUND_STATUS.SETTLED) {
      const { closeTime, drawTime } = calculateNextRoundTimes();

      // Calculate informational rollover amount from previous round
      const rolloverAmount = round
        ? round.tier1RolloverOut + round.tier2RolloverOut + round.tier3RolloverOut
        : 0n;

      const createResult = await withRetry(
        () =>
          executeAndWait(
            client,
            keypair,
            buildCreateRoundTx(LOTTERY_ADMIN_CAP_ID, closeTime, drawTime, rolloverAmount),
            'create_round',
          ),
        { label: 'create_round' },
      );

      const newRoundId = parseNewRoundId(createResult);
      console.log(
        `[${timestamp()}] Created round | close: ${new Date(closeTime).toISOString()} | draw: ${new Date(drawTime).toISOString()}`,
      );

      // Transfer rollover from previous round (if exists)
      if (round && newRoundId) {
        await withRetry(
          () =>
            executeAndWait(
              client,
              keypair,
              buildTransferRolloverTx(round!.id, newRoundId, LOTTERY_ADMIN_CAP_ID),
              'transfer_rollover',
            ),
          { label: 'transfer_rollover' },
        );
        console.log(`[${timestamp()}] Rollover transferred from round ${round.roundNumber}`);
      }

      consecutiveErrors = 0;
      return round;
    }

    // Case 2: OPEN + closeTime reached -> close
    if (round.status === ROUND_STATUS.OPEN && Date.now() >= round.closeTime) {
      await withRetry(
        () =>
          executeAndWait(
            client,
            keypair,
            buildCloseRoundPermissionlessTx(round!.id),
            'close_round',
          ),
        { label: 'close_round' },
      );
      console.log(`[${timestamp()}] Round ${round.roundNumber} closed`);
      consecutiveErrors = 0;
      return round;
    }

    // Case 3: CLOSED + drawTime reached -> draw
    if (round.status === ROUND_STATUS.CLOSED && Date.now() >= round.drawTime) {
      await withRetry(
        () =>
          executeAndWait(
            client,
            keypair,
            buildDrawNumbersPermissionlessTx(round!.id),
            'draw_numbers',
          ),
        { label: 'draw_numbers' },
      );
      console.log(`[${timestamp()}] Round ${round.roundNumber} numbers drawn`);
      consecutiveErrors = 0;
      return round;
    }

    // Case 4: DRAWN -> count winners + settle
    if (round.status === ROUND_STATUS.DRAWN) {
      if (!round.drawnNumbers) {
        console.error(`[${timestamp()}] Round ${round.roundNumber} is DRAWN but no drawn numbers found`);
        return round;
      }

      // Count winners with retry on ticket_count mismatch
      let counts: { tier1: number; tier2: number; tier3: number; totalFetched: number } | null = null;

      for (let attempt = 0; attempt < MAX_EVENT_COUNT_RETRIES; attempt++) {
        const result = await countWinners(client, round.id, round.drawnNumbers);

        if (result.totalFetched === round.ticketCount) {
          counts = result;
          break;
        }

        console.warn(
          `[${timestamp()}] Ticket count mismatch: events=${result.totalFetched}, chain=${round.ticketCount} (attempt ${attempt + 1}/${MAX_EVENT_COUNT_RETRIES})`,
        );

        if (attempt < MAX_EVENT_COUNT_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, EVENT_COUNT_RETRY_DELAY_MS));
        }
      }

      if (!counts) {
        console.error(
          `[${timestamp()}] [LOTTERY CRITICAL] Failed to verify ticket count after ${MAX_EVENT_COUNT_RETRIES} attempts. Settlement skipped.`,
        );
        return round;
      }

      console.log(
        `[${timestamp()}] Winners: tier1=${counts.tier1}, tier2=${counts.tier2}, tier3=${counts.tier3} (total tickets: ${counts.totalFetched})`,
      );

      await withRetry(
        () =>
          executeAndWait(
            client,
            keypair,
            buildSettleRoundTx(round!.id, LOTTERY_ADMIN_CAP_ID, counts!.tier1, counts!.tier2, counts!.tier3),
            'settle_round',
          ),
        { label: 'settle_round' },
      );
      console.log(`[${timestamp()}] Round ${round.roundNumber} settled`);
      consecutiveErrors = 0;
      return round;
    }

    // OPEN but closeTime not reached -- idle
    consecutiveErrors = 0;
    return round;
  } catch (error) {
    consecutiveErrors++;
    const msg = error instanceof Error ? error.message : String(error);
    const prefix = consecutiveErrors >= 5 ? '[LOTTERY CRITICAL]' : '[LOTTERY ERROR]';
    console.error(`[${timestamp()}] ${prefix} ${msg} (consecutive: ${consecutiveErrors})`);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`[${timestamp()}] [LOTTERY CRITICAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Check bot health.`);
    }
    return round;
  } finally {
    isRunning = false;
  }
}

// ========================================
// Entry point
// ========================================

async function main() {
  // Validate env
  const keyInput = process.env.LOTTERY_ADMIN_KEY;
  if (!keyInput) {
    console.error('LOTTERY_ADMIN_KEY environment variable is required');
    process.exit(1);
  }

  const keypair = parseKeypair(keyInput);
  const address = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] Lottery Keeper starting`);
  console.log(`[${timestamp()}] Address: ${address}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);

  // Verify AdminCap ownership
  const capObj = await client.getObject({
    id: LOTTERY_ADMIN_CAP_ID,
    options: { showOwner: true },
  });
  const owner = (capObj.data?.owner as any)?.AddressOwner;
  if (owner !== address) {
    console.error(
      `[${timestamp()}] AdminCap ${LOTTERY_ADMIN_CAP_ID} is owned by ${owner}, not ${address}. Aborting.`,
    );
    process.exit(1);
  }
  console.log(`[${timestamp()}] AdminCap ownership verified`);

  // Graceful shutdown
  const shutdown = () => {
    console.log(`[${timestamp()}] Shutting down...`);
    shuttingDown = true;
    // Wait for current tick to finish, then exit
    const check = setInterval(() => {
      if (!isRunning) {
        clearInterval(check);
        process.exit(0);
      }
    }, 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // --once flag: single tick and exit
  const runOnce = process.argv.includes('--once');

  // Initial tick
  const round = await tick(client, keypair);

  if (runOnce) {
    process.exit(0);
  }

  // Deadline-driven polling loop (setTimeout chain, no overlap)
  const loop = async () => {
    while (!shuttingDown) {
      const r = await tick(client, keypair);
      if (shuttingDown) break;
      const interval = getNextInterval(r);
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  };

  loop();
}

main().catch((err) => {
  console.error(`[${timestamp()}] Fatal error:`, err);
  process.exit(1);
});
