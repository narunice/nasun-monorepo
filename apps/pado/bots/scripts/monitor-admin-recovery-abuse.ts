/**
 * Polls Nasun devnet for unauthorized calls to the deprecated admin recovery
 * path on the v3 prediction_market package.
 *
 * Background:
 *   The v3 publish (2026-05-20) shipped `mint_admin_cap_via_upgrade*` without
 *   binding the recovery to *this* package's UpgradeCap. The v4 hotfix replaced
 *   the function bodies with `abort EAdminRecoveryDeprecated`, but Sui upgrade
 *   does not retire old package code — a caller who explicitly addresses the
 *   v3 packageId can still execute the original (unsafe) bodies and mint a
 *   fresh AdminCap from any UpgradeCap. Until the v5 fresh-publish cutover,
 *   this monitor is the only signal that the path was exploited.
 *
 *   Successful calls on v4 are impossible (abort code 24); successful calls on
 *   v3 are by definition unauthorised. The only legitimate v3 invocation is
 *   the original recovery call by 0xe1c4c90b... at 2026-05-20T01:25Z; anything
 *   else means a fresh AdminCap exists in attacker hands.
 *
 * Required env:
 *   NASUN_RPC_URL                  default https://rpc.devnet.nasun.io
 *   TELEGRAM_BOT_TOKEN             optional; if set, alerts via Telegram
 *   TELEGRAM_ALERT_CHAT_ID         optional; required if BOT_TOKEN is set
 *   ADMIN_RECOVERY_MONITOR_STATE   optional path for the last-cursor file
 *                                   (default ./.monitor-admin-recovery.state)
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/monitor-admin-recovery-abuse.ts
 *   node --env-file=.env --import tsx scripts/monitor-admin-recovery-abuse.ts --once
 *
 * pm2 (prod):
 *   pm2 start scripts/monitor-admin-recovery-abuse.ts --name pado-admin-monitor \
 *       --interpreter tsx --no-autorestart
 */

import { SuiClient } from '@mysten/sui/client';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const POLL_INTERVAL_MS = 60_000;
const STATE_PATH = process.env.ADMIN_RECOVERY_MONITOR_STATE || './.monitor-admin-recovery.state';

// Packages where the unsafe function body still exists. v3 is the original
// publish; v1/v2 predate the function entirely so are not at risk. v4+ has the
// abort body, but Sui upgrade keeps v4's function callable at *any* version
// only via the latest packageId — old versions of v4 are not separately at
// risk because the abort body was published in v4.
const V3_UNSAFE_PACKAGE = '0xca68c776715f4c6b87461048aaf39aa6a5a278f3f0bf907d5caedb6fc869f50c';
const MODULE = 'prediction_market';
const UNSAFE_FNS = ['mint_admin_cap_via_upgrade_entry', 'mint_admin_cap_via_upgrade'];

// The one legitimate call we made during initial admin recovery. Anything else
// is an abuse signal.
const LEGITIMATE_TX = 'NGbRVm6tQpBAJDGGAzBoezmPt2kdjnQCKbd1jRr9e1h';

async function tgPost(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chat) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Telegram post failed:`, err);
  }
}

interface State {
  // Last-seen tx digest per (package, function). Cursor for the next poll.
  cursors: Record<string, string | null>;
}

function readState(): State {
  if (!existsSync(STATE_PATH)) return { cursors: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State;
  } catch {
    return { cursors: {} };
  }
}

function writeState(state: State): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function pollOnce(client: SuiClient, state: State): Promise<void> {
  for (const fn of UNSAFE_FNS) {
    const key = `${V3_UNSAFE_PACKAGE}/${fn}`;
    const cursor = state.cursors[key] ?? null;
    try {
      const r = await client.queryTransactionBlocks({
        filter: { MoveFunction: { package: V3_UNSAFE_PACKAGE, module: MODULE, function: fn } },
        limit: 25,
        order: 'descending',
        options: { showInput: true },
      });
      // Walk newest-first, stop when we hit the last-seen cursor.
      const newOnes: { digest: string; sender: string | undefined; ts: string }[] = [];
      for (const tx of r.data) {
        if (cursor && tx.digest === cursor) break;
        newOnes.push({
          digest: tx.digest,
          sender: tx.transaction?.data?.sender,
          ts: new Date(Number(tx.timestampMs ?? 0)).toISOString(),
        });
      }
      // Filter the one legitimate tx; anything else is an alert.
      const abusive = newOnes.filter((tx) => tx.digest !== LEGITIMATE_TX);
      for (const tx of abusive) {
        const msg = `🚨 <b>Pado prediction admin compromise</b>\nUnauthorized call to <code>${fn}</code> on v3 package.\n\nTime: ${tx.ts}\nSigner: <code>${tx.sender}</code>\nTx: <code>${tx.digest}</code>\n\nAction: assume the signer now holds a valid AdminCap. Audit recent <code>create_market</code> / <code>admin_cancel_market</code> calls and consider expediting the v5 fresh-publish cutover.`;
        console.error(`[${tx.ts}] ABUSE: ${fn} signer=${tx.sender} tx=${tx.digest}`);
        await tgPost(msg);
      }
      if (r.data.length > 0) {
        state.cursors[key] = r.data[0].digest;
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] poll error on ${fn}:`, err instanceof Error ? err.message : String(err));
    }
  }
  writeState(state);
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const client = new SuiClient({ url: RPC_URL });
  const state = readState();

  console.log(`[${new Date().toISOString()}] admin-recovery monitor started. RPC=${RPC_URL}, interval=${POLL_INTERVAL_MS}ms, once=${once}`);
  console.log(`  Watching: ${V3_UNSAFE_PACKAGE}::${MODULE}::{${UNSAFE_FNS.join(', ')}}`);
  console.log(`  Legitimate baseline tx: ${LEGITIMATE_TX}`);

  await pollOnce(client, state);
  if (once) return;

  setInterval(() => { void pollOnce(client, state); }, POLL_INTERVAL_MS);
  process.on('SIGINT', () => { console.log('shutdown'); process.exit(0); });
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
