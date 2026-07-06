/**
 * ONE-OFF fire-fight: settle stuck v8 Lottery Round 3 (0x796fdd0a).
 *
 * The keeper (fetchLatestRound / countWinners) is dead because it discovers the
 * round and counts winners via queryEvents, which the devnet fullnode's event
 * pruning now throws on ("Could not find the referenced transaction events").
 * Round 3 (24,449 tickets) has been OPEN past its 2026-07-06 00:00 UTC draw
 * time for hours. This script bypasses both broken paths:
 *   - round discovery  -> hardcoded ROUND_ID (verified on-chain)
 *   - winner counting   -> gostop.lottery_ticket in the box Postgres (durable;
 *                          the indexer captured all 24,449 tickets before the
 *                          events were pruned). Isolated from the pre-v8 round-3
 *                          collision by (round_number=3 AND purchase_ts >= v8 start).
 *
 * Lifecycle it drives:  OPEN -> close_round_permissionless -> CLOSED ->
 *   draw_numbers_permissionless -> DRAWN -> settle_round(AdminCap).
 *
 * Gates (nothing signs without an explicit flag):
 *   (no flag)            -> read-only: print round state + (if DRAWN) winner preview.
 *   CONFIRM_DRAW=true     -> close + draw (permissionless). Fixes the winning numbers.
 *   CONFIRM_SETTLE=true   -> settle_round with the DB-derived tier counts (AdminCap).
 *
 * Env:
 *   LOTTERY_ADMIN_KEY   admin privkey (owns AdminCap 0x87066dda). Required to sign.
 *   NASUN_RPC_URL       default https://rpc.devnet.nasun.io
 *   PG_DB               default nasun_points
 *
 * Run on the box (has the admin key + local Postgres):
 *   node --import tsx scripts/firefight-round3-settle.ts                 # read-only
 *   CONFIRM_DRAW=true   node --import tsx scripts/firefight-round3-settle.ts
 *   CONFIRM_SETTLE=true node --import tsx scripts/firefight-round3-settle.ts
 */

import { execFileSync } from 'node:child_process';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const PG_DB = process.env.PG_DB || 'nasun_points';

// Verified on-chain / devnet-ids constants.
const PKG = '0x397f418412738dc82ebb09f0dfda64f449b8a738c64f303ced6661cd6d2191d2';
const ROUND_ID = '0x796fdd0a3e8d3ef75de389e2f111e4bedeb68d6f315a1d35b750309b294d9f72';
const REGISTRY = '0xd66d59341aef646f9ea26ee88099084f219350d9e4994a4c01f19fe8c628a6ac';
const ADMIN_CAP = '0x87066ddab3f2905558e73af34e996afe431d3a076cf1fc82c550f018dd88cf09';
const POOL = '0xbed633d543e6b3bf932fb91c4238e07e6377ed8e8521e8f67760c2b01c332fd2';
const CLOCK = '0x6';
const RANDOM = '0x8';

// v8 round 3 opened when round 2 closed: 2026-06-29 00:00 UTC. Anything at or
// after this under round_number=3 is a v8 ticket (pre-v8 round 3 is < this).
const V8_ROUND3_MIN_TS = 1782691200000;
const EXPECTED_TICKETS = 24449; // on-chain ticket_count sanity anchor.

const STATUS = { 0: 'OPEN', 1: 'CLOSED', 2: 'DRAWN', 3: 'SETTLED' } as const;

function parseKeypair(k: string): Ed25519Keypair {
  if (k.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(k).secretKey);
  const clean = k.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('bad LOTTERY_ADMIN_KEY');
  return Ed25519Keypair.fromSecretKey(Buffer.from(clean, 'hex'));
}

interface Round {
  status: number;
  closeTime: number;
  drawTime: number;
  ticketCount: number;
  prizePool: bigint;
  drawnNumbers: number[] | null;
}

async function fetchRound(client: SuiClient): Promise<Round> {
  const obj = await client.getObject({ id: ROUND_ID, options: { showContent: true } });
  if (obj.data?.content?.dataType !== 'moveObject') throw new Error('round not found');
  const f = obj.data.content.fields as Record<string, any>;
  const drawn = f.drawn_numbers;
  const nums = drawn == null ? null
    : Array.isArray(drawn) ? drawn.map(Number)
    : Array.isArray(drawn?.vec) ? drawn.vec.map(Number)
    : drawn?.fields?.vec ? drawn.fields.vec.map(Number)
    : null;
  return {
    status: Number(f.status),
    closeTime: Number(f.close_time),
    drawTime: Number(f.draw_time),
    ticketCount: Number(f.ticket_count),
    prizePool: BigInt(f.prize_pool ?? 0),
    drawnNumbers: nums && nums.length > 0 ? nums : null,
  };
}

async function signWait(client: SuiClient, kp: Ed25519Keypair, tx: Transaction, label: string) {
  tx.setGasBudget(200_000_000);
  const r = await client.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
  if (r.effects?.status?.status !== 'success') throw new Error(`${label} failed: ${r.effects?.status?.error}`);
  console.log(`  ${label} tx: ${r.digest}`);
  await client.waitForTransaction({ digest: r.digest });
}

function countWinnersFromDb(drawn: number[]): { t1: number; t2: number; t3: number; total: number } {
  if (drawn.length !== 5 || drawn.some((n) => !Number.isInteger(n) || n < 1 || n > 25)) {
    throw new Error(`invalid drawn numbers: ${JSON.stringify(drawn)}`);
  }
  const arr = `ARRAY[${drawn.join(',')}]`;
  const sql =
    `WITH w AS (SELECT (SELECT count(*) FROM unnest(t.numbers) x WHERE x = ANY(${arr})) m ` +
    `FROM gostop.lottery_ticket t WHERE t.round_number=3 AND t.purchase_ts_ms >= ${V8_ROUND3_MIN_TS}) ` +
    `SELECT count(*) FILTER (WHERE m=5), count(*) FILTER (WHERE m=4), count(*) FILTER (WHERE m=3), count(*) FROM w;`;
  const out = execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', PG_DB, '-t', '-A', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();
  const [t1, t2, t3, total] = out.split('|').map((s) => Number(s.trim()));
  return { t1, t2, t3, total };
}

function buildClose(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${PKG}::lottery::close_round_permissionless`, arguments: [tx.object(ROUND_ID), tx.object(CLOCK)] });
  return tx;
}
function buildDraw(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${PKG}::lottery::draw_numbers_permissionless`, arguments: [tx.object(ROUND_ID), tx.object(RANDOM), tx.object(CLOCK)] });
  return tx;
}
function buildSettle(t1: number, t2: number, t3: number): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::lottery::settle_round`,
    arguments: [
      tx.object(ADMIN_CAP), tx.object(ROUND_ID), tx.object(REGISTRY), tx.object(POOL),
      tx.pure.u64(BigInt(t1)), tx.pure.u64(BigInt(t2)), tx.pure.u64(BigInt(t3)), tx.object(CLOCK),
    ],
  });
  return tx;
}

async function main() {
  const client = new SuiClient({ url: RPC });
  const doDraw = process.env.CONFIRM_DRAW === 'true';
  const doSettle = process.env.CONFIRM_SETTLE === 'true';
  const keyInput = process.env.LOTTERY_ADMIN_KEY;
  const kp = keyInput ? parseKeypair(keyInput) : null;
  if (kp) console.log(`signer: ${kp.toSuiAddress()}`);

  let round = await fetchRound(client);
  const now = Date.now();
  console.log(`\nRound 3 (${ROUND_ID.slice(0, 12)}): status=${STATUS[round.status as 0] ?? round.status}`);
  console.log(`  close=${new Date(round.closeTime).toISOString()} draw=${new Date(round.drawTime).toISOString()} (now ${new Date(now).toISOString()})`);
  console.log(`  ticket_count=${round.ticketCount}  prize_pool=${round.prizePool}`);

  // Phase 1: close + draw.
  if (round.status === 0) {
    if (now < round.closeTime) throw new Error('close_time not reached');
    if (!doDraw) { console.log('\n[read-only] OPEN. Re-run with CONFIRM_DRAW=true to close+draw.'); return; }
    if (!kp) throw new Error('LOTTERY_ADMIN_KEY required to sign');
    console.log('\nClosing round...');
    await signWait(client, kp, buildClose(), 'close_round_permissionless');
    round = await fetchRound(client);
  }
  if (round.status === 1) {
    if (!doDraw) { console.log('\n[read-only] CLOSED. Re-run with CONFIRM_DRAW=true to draw.'); return; }
    if (!kp) throw new Error('LOTTERY_ADMIN_KEY required to sign');
    console.log('Drawing numbers...');
    await signWait(client, kp, buildDraw(), 'draw_numbers_permissionless');
    round = await fetchRound(client);
  }

  if (round.status !== 2) {
    console.log(`\nRound status is ${STATUS[round.status as 0] ?? round.status}; nothing to settle.`);
    return;
  }

  // Phase 2: winner preview from durable DB source.
  const drawn = round.drawnNumbers;
  if (!drawn) throw new Error('DRAWN but drawn_numbers empty');
  console.log(`\nDRAWN numbers: {${drawn.join(', ')}}`);
  const { t1, t2, t3, total } = countWinnersFromDb(drawn);
  console.log(`\n=== Winner counts (gostop.lottery_ticket, round_number=3, purchase_ts>=v8 start) ===`);
  console.log(`  tickets in window: ${total}  (on-chain anchor: ${EXPECTED_TICKETS})`);
  console.log(`  tier1 (5 match): ${t1}\n  tier2 (4 match): ${t2}\n  tier3 (3 match): ${t3}`);
  if (total !== EXPECTED_TICKETS) throw new Error(`ticket-count mismatch (${total} != ${EXPECTED_TICKETS}); ABORT, do not settle`);

  // Phase 3: settle.
  if (!doSettle) { console.log('\n[preview] Re-run with CONFIRM_SETTLE=true to settle_round with the above counts.'); return; }
  if (!kp) throw new Error('LOTTERY_ADMIN_KEY required to sign');
  console.log('\nSettling round...');
  await signWait(client, kp, buildSettle(t1, t2, t3), 'settle_round');
  const final = await fetchRound(client);
  console.log(`\nDONE. Round 3 status now: ${STATUS[final.status as 0] ?? final.status}`);
}

main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
