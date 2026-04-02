/**
 * Games USDC -> Ecosystem Bonus Points
 *
 * Scans recent game activity (scratchcard, lottery, numbermatch) for payouts,
 * fetches USDC amounts from on-chain events, and awards bonus points.
 *
 * Rules:
 *   - 1 USDC (1,000,000 micro-NUSDC) = 1 Bonus Point
 *   - Per-user rolling 7-day cap: 600 points
 *   - Idempotent via tx_digest
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/settle-games.ts
 *   npx tsx src/scripts/settle-games.ts --dry-run
 */

import postgres from 'postgres';

const RPC_URL = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';
const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WEEKLY_CAP = 600;
const USDC_DECIMALS = 1_000_000;

// Game categories whose events may contain USDC payouts
const GAME_CATEGORIES = ['pado-lottery', 'pado-scratchcard', 'pado-games'];
// Activity types that indicate a payout event
const PAYOUT_TYPES = ['claim-prize', 'scratchcard-purchase', 'numbermatch-play'];

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const dryRun = process.argv.includes('--dry-run');

interface RpcEvent {
  type: string;
  parsedJson?: Record<string, unknown>;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function hexToBase58(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = Buffer.from(clean, 'hex');
  const digits = [0];
  for (const b of bytes) {
    let carry = b;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = '';
  for (let i = 0; bytes[i] === 0 && i < bytes.length - 1; i++) str += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

async function getPayoutFromTx(txDigest: string): Promise<number> {
  const digest = hexToBase58(txDigest);
  const tx = await rpcCall<{
    events?: RpcEvent[];
  }>('sui_getTransactionBlock', [digest, { showEvents: true }]);

  if (!tx?.events) return 0;

  for (const ev of tx.events) {
    const parsed = ev.parsedJson;
    if (!parsed) continue;

    // Scratchcard: ScratchCardPurchased { payout }
    // Lottery: PrizeClaimed { amount }
    // NumberMatch: NumberMatchPlayed { payout, is_win }
    const payout = parsed.payout ?? parsed.amount;
    if (payout !== undefined && payout !== null) {
      const val = Number(payout);
      if (val > 0) return val;
    }
  }

  return 0;
}

async function main() {
  console.log(`\n=== Games USDC -> Bonus Points (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // Find recent game activities (last 7 days) that don't have a corresponding bonus yet
  const recentGames = await db`
    SELECT ap.tx_digest, ap.wallet_address, ap.identity_id, ap.category, ap.activity_type
    FROM activity_points ap
    WHERE ap.category = ANY(${GAME_CATEGORIES})
      AND ap.activity_type = ANY(${PAYOUT_TYPES})
      AND ap.tx_timestamp >= NOW() - INTERVAL '7 days'
      AND ap.identity_id IS NOT NULL
      AND NOT ap.flagged
      AND NOT EXISTS (
        SELECT 1 FROM activity_points bonus
        WHERE bonus.tx_digest = 'bonus-game:' || ap.identity_id || ':' || ap.tx_digest
          AND bonus.activity_type = 'game-usdc'
      )
    ORDER BY ap.tx_timestamp DESC
  `;

  console.log(`Found ${recentGames.length} unprocessed game events\n`);

  let inserted = 0;
  let skipped = 0;
  let capHits = 0;

  for (const game of recentGames) {
    const txDigest = game.tx_digest as string;
    const identityId = game.identity_id as string;
    const wallet = game.wallet_address as string;

    try {
      // Fetch payout from on-chain event
      const payoutMicro = await getPayoutFromTx(txDigest);
      if (payoutMicro <= 0) {
        skipped++;
        continue;
      }

      const bonusPoints = Math.floor(payoutMicro / USDC_DECIMALS);
      if (bonusPoints <= 0) {
        skipped++;
        continue;
      }

      // Check rolling 7-day cap
      const [capRow] = await db`
        SELECT COALESCE(SUM(final_points), 0)::numeric as used
        FROM activity_points
        WHERE identity_id = ${identityId}
          AND category = 'ecosystem-bonus-game'
          AND tx_timestamp >= NOW() - INTERVAL '7 days'
          AND NOT flagged
      `;
      const used = parseFloat(capRow?.used as string ?? '0');
      const remaining = WEEKLY_CAP - used;

      if (remaining <= 0) {
        capHits++;
        continue;
      }

      const awardedPts = Math.min(bonusPoints, remaining);
      const digest = `bonus-game:${identityId}:${txDigest}`;

      if (dryRun) {
        console.log(`  ${wallet.slice(0, 10)}... payout=${payoutMicro} -> ${awardedPts} pts (cap used: ${used}/${WEEKLY_CAP})`);
        inserted++;
        continue;
      }

      const result = await db`
        INSERT INTO activity_points
          (wallet_address, identity_id, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number)
        VALUES
          (${wallet}, ${identityId}, ${digest}, 'ecosystem-bonus-game', 'game-usdc',
           ${awardedPts}, 1.0, 1.0, ${awardedPts.toFixed(2)},
           NOW()::timestamptz, 0, 0)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) {
        inserted++;
        console.log(`  ${wallet.slice(0, 10)}... +${awardedPts} pts (payout: ${payoutMicro})`);
      }
    } catch (err) {
      console.error(`  Error processing ${txDigest.slice(0, 16)}:`, (err as Error).message);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Awarded: ${inserted}, Skipped (no payout): ${skipped}, Cap hits: ${capHits}`);

  await db.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
