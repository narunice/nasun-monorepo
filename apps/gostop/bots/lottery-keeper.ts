/**
 * GoStop Lottery Keeper Bot
 *
 * Fully automates the weekly 5-of-25 lottery lifecycle:
 *   SETTLED/none -> create_round + transfer_rollover
 *   OPEN         -> wait for closeTime, then close_round_permissionless
 *   CLOSED       -> wait for drawTime, then draw_numbers_permissionless
 *   DRAWN        -> count winners off-chain, then settle_round (treasury
 *                   flows to BankrollPool atomically)
 *
 * Stateless: chain is the source of truth. Reads round status each tick.
 *
 * Env vars:
 *   LOTTERY_ADMIN_KEY       - Private key (hex or suiprivkey) that owns AdminCap
 *   NASUN_RPC_URL           - default: https://rpc.devnet.nasun.io
 *   LOTTERY_PACKAGE_ID      - override for upgraded package
 *   LOTTERY_REGISTRY_ID     - override
 *   LOTTERY_ADMIN_CAP_ID    - override
 *   BANKROLL_POOL_ID        - override
 *   LOTTERY_CLOSE_DAY       - default 1 (Monday)
 *   LOTTERY_CLOSE_HOUR      - default 0 (00:00 UTC)
 *   LOTTERY_DRAW_OFFSET_MS  - default 0 (immediate draw)
 *
 * Usage:
 *   pnpm lottery-keeper           (loop)
 *   pnpm lottery-keeper:once      (one tick then exit)
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { withRetry } from './lib/retry.js';

// Single-instance lockfile. Two concurrent keepers cause LockConflict on
// AdminCap (owned object) and have crashed the fullnode in the past
// (per project_pado_bot_single_instance memory). Lock is released on
// graceful exit; on crash, stale lock is detected via PID alive check.
const LOCKFILE = process.env.GOSTOP_KEEPER_LOCKFILE || '/tmp/gostop-lottery-keeper.lock';

function acquireLock(): void {
  if (existsSync(LOCKFILE)) {
    const pid = Number(readFileSync(LOCKFILE, 'utf8').trim());
    if (pid && isAlive(pid)) {
      console.error(`Another gostop-lottery-keeper is running (pid=${pid}). Lock: ${LOCKFILE}`);
      process.exit(1);
    }
    console.warn(`Stale lock detected (pid=${pid} dead). Removing.`);
    try { unlinkSync(LOCKFILE); } catch { /* noop */ }
  }
  const fd = openSync(LOCKFILE, 'wx'); // exclusive create; fails if exists
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
}

function releaseLock(): void {
  try { unlinkSync(LOCKFILE); } catch { /* noop */ }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
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

const GAS_REFILL_THRESHOLD = 0.3; // NASUN
const MAX_CONSECUTIVE_ERRORS = 10;
const EVENT_COUNT_RETRY_DELAY_MS = 30_000;
const MAX_EVENT_COUNT_RETRIES = 5;

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

async function getGasBalance(client: SuiClient, address: string): Promise<number> {
  const balance = await client.getBalance({ owner: address });
  return Number(balance.totalBalance) / 1e9;
}

async function ensureGas(client: SuiClient, address: string): Promise<void> {
  const balance = await getGasBalance(client, address);
  if (balance >= GAS_REFILL_THRESHOLD) return;

  console.log(`[${timestamp()}] Gas low (${balance.toFixed(4)} NASUN), requesting refill...`);
  const ok = await requestGas(address);
  if (!ok) {
    throw new Error(`Faucet refill failed (balance=${balance.toFixed(4)} NASUN). Aborting tick.`);
  }
  // Recheck after faucet ack to confirm balance moved.
  const after = await getGasBalance(client, address);
  if (after < GAS_REFILL_THRESHOLD) {
    throw new Error(`Faucet returned ok but balance still ${after.toFixed(4)} NASUN. Aborting tick.`);
  }
}

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

function getNextInterval(round: LotteryRound | null): number {
  if (!round || round.status === ROUND_STATUS.SETTLED) return 10_000;
  if (round.status === ROUND_STATUS.DRAWN) return 10_000;

  const nextEvent =
    round.status === ROUND_STATUS.OPEN ? round.closeTime : round.drawTime;
  const timeUntil = nextEvent - Date.now();

  if (timeUntil <= 60_000) return 10_000;
  if (timeUntil <= 3_600_000) return 60_000;
  return 600_000;
}

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
        (round
          ? ` | Pool: ${(Number(round.prizePool) / 1e6).toFixed(2)} NUSDC | Tickets: ${round.ticketCount}`
          : ''),
    );

    // Case 1: No round or SETTLED -> create next round + transfer rollover
    if (!round || round.status === ROUND_STATUS.SETTLED) {
      const { closeTime, drawTime } = calculateNextRoundTimes();
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

      const newRoundId = parseNewRoundId(createResult.effects);
      console.log(
        `[${timestamp()}] Created round | close: ${new Date(closeTime).toISOString()} | draw: ${new Date(drawTime).toISOString()}`,
      );

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
        console.error(`[${timestamp()}] Round ${round.roundNumber} is DRAWN but no drawn numbers`);
        return round;
      }

      let counts: { tier1: number; tier2: number; tier3: number; totalFetched: number } | null = null;

      for (let attempt = 0; attempt < MAX_EVENT_COUNT_RETRIES; attempt++) {
        const result = await countWinners(client, round.id, round.drawnNumbers, round.startTime);
        if (result.totalFetched >= round.ticketCount) {
          if (result.totalFetched > round.ticketCount) {
            // Extra events beyond chain ticketCount: possible duplicate event emission.
            // Winner counts computed from all events are still valid since settle_round
            // distributes the pool across counted winners.
            console.warn(
              `[${timestamp()}] Event surplus: events=${result.totalFetched}, chain=${round.ticketCount} — proceeding with settlement`,
            );
          }
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
          `[${timestamp()}] [GOSTOP CRITICAL] Failed to verify ticket count after ${MAX_EVENT_COUNT_RETRIES} attempts. Settlement skipped.`,
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
            buildSettleRoundTx(
              round!.id,
              LOTTERY_ADMIN_CAP_ID,
              counts!.tier1,
              counts!.tier2,
              counts!.tier3,
            ),
            'settle_round',
          ),
        { label: 'settle_round' },
      );
      console.log(`[${timestamp()}] Round ${round.roundNumber} settled`);
      consecutiveErrors = 0;
      return round;
    }

    consecutiveErrors = 0;
    return round;
  } catch (error) {
    consecutiveErrors++;
    const msg = error instanceof Error ? error.message : String(error);
    const prefix = consecutiveErrors >= 5 ? '[GOSTOP CRITICAL]' : '[GOSTOP ERROR]';
    console.error(`[${timestamp()}] ${prefix} ${msg} (consecutive: ${consecutiveErrors})`);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`[${timestamp()}] [GOSTOP CRITICAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Check bot health.`);
    }
    return round;
  } finally {
    isRunning = false;
  }
}

async function main() {
  const keyInput = process.env.LOTTERY_ADMIN_KEY;
  if (!keyInput) {
    console.error('LOTTERY_ADMIN_KEY environment variable is required');
    process.exit(1);
  }

  acquireLock();

  const keypair = parseKeypair(keyInput);
  const address = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] GoStop Lottery Keeper starting`);
  console.log(`[${timestamp()}] Address: ${address}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);

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

  const shutdown = (signal: string) => () => {
    console.log(`[${timestamp()}] Received ${signal}, shutting down...`);
    shuttingDown = true;
    const check = setInterval(() => {
      if (!isRunning) {
        clearInterval(check);
        releaseLock();
        process.exit(0);
      }
    }, 500);
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('exit', releaseLock);

  const runOnce = process.argv.includes('--once');

  await tick(client, keypair);

  if (runOnce) {
    process.exit(0);
  }

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
