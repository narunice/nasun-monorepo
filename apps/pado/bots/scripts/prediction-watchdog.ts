/**
 * Prediction Market Watchdog
 *
 * Answers the question nobody could answer on 2026-08-09: "are markets still
 * being discovered and settled?" The keeper was `online` with an empty log and
 * every process-level check passed while 50 markets sat unattended for four
 * days, because a broken discovery and an empty market set look identical from
 * the outside.
 *
 * Alerts (Telegram) on:
 *   A. the durable market list is unreachable or empty  -> discovery is broken
 *   B. a market closed more than STALE_CLOSE_HOURS ago and is still OPEN
 *      -> settlement is stalled
 *   C. an OPEN market's resolve_deadline is within DEADLINE_WARN_HOURS
 *      -> about to decay into refund-only
 *
 * Read-only: it never resolves, cancels, or restarts anything.
 *
 * Usage: tsx scripts/prediction-watchdog.ts [--dry-run]
 */

import { SuiClient } from '@mysten/sui/client';
import { readFileSync } from 'node:fs';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
// Same default as lib/prediction-market-discovery.ts: public URL so a local
// run works, with box overriding to the loopback via .env.
const EXPLORER_API_URL = process.env.EXPLORER_API_URL || 'https://explorer.nasun.io/api/v1';
const TELEGRAM_ENV_FILE =
  process.env.PREDICTION_WATCHDOG_ENV_FILE ||
  '/home/nasun/nasun-monorepo/apps/network-explorer/api-server/.env';

const STALE_CLOSE_HOURS = Number(process.env.PREDICTION_WATCHDOG_STALE_CLOSE_HOURS || 6);
const DEADLINE_WARN_HOURS = Number(process.env.PREDICTION_WATCHDOG_DEADLINE_WARN_HOURS || 24);
const DRY_RUN = process.argv.includes('--dry-run');

const STATUS_OPEN = 0;
const CHUNK = 50;

interface OpenMarket {
  id: string;
  question: string;
  closeTime: number;
  resolveDeadline: number;
  /**
   * Earliest time the keeper is even allowed to resolve. Some criteria
   * (weather windows, multi-day aggregates) carry an explicit `ResolveAfter`
   * later than close_time, so measuring staleness from close_time alone would
   * page every 30 minutes for days about markets that are waiting exactly as
   * designed.
   */
  resolvableFrom: number;
}

function parseResolveAfter(criteria: string): number | null {
  const match = criteria.match(/ResolveAfter:\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}T${match[2]}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function readEnvValue(key: string): string | null {
  // Process env wins (systemd EnvironmentFile, local runs); the explorer
  // api-server .env is the fallback because that is where the box watchdogs
  // already keep the Telegram credentials.
  const fromProcess = process.env[key];
  if (fromProcess) return fromProcess.trim();
  try {
    const line = readFileSync(TELEGRAM_ENV_FILE, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || null;
  } catch {
    return null;
  }
}

async function notify(text: string): Promise<void> {
  console.log(text);
  if (DRY_RUN) return;
  const token = readEnvValue('TELEGRAM_BOT_TOKEN');
  const chatId = readEnvValue('TELEGRAM_ALERT_CHAT_ID');
  if (!token || !chatId) {
    console.error(`Telegram creds missing in ${TELEGRAM_ENV_FILE}; alert not delivered`);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10_000),
  });
  console.log(`telegram HTTP ${res.status}`);
}

async function fetchMarketIds(): Promise<string[]> {
  const res = await fetch(`${EXPLORER_API_URL}/prediction/markets`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`market list HTTP ${res.status}`);
  const data = (await res.json()) as { marketIds?: unknown };
  if (!Array.isArray(data.marketIds)) throw new Error('malformed market list');
  return data.marketIds.filter((id): id is string => typeof id === 'string');
}

async function fetchOpenMarkets(client: SuiClient, ids: string[]): Promise<OpenMarket[]> {
  const open: OpenMarket[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const objects = await client.multiGetObjects({
      ids: ids.slice(i, i + CHUNK),
      options: { showContent: true },
    });
    for (const o of objects) {
      const content = o.data?.content;
      if (!content || content.dataType !== 'moveObject') continue;
      const f = content.fields as unknown as Record<string, string>;
      if (Number(f.status) !== STATUS_OPEN) continue;
      const closeTime = Number(f.close_time);
      const resolveAfter = parseResolveAfter(String(f.resolution_criteria ?? ''));
      open.push({
        id: o.data!.objectId,
        question: String(f.question ?? '').slice(0, 60),
        closeTime,
        resolveDeadline: Number(f.resolve_deadline),
        resolvableFrom: resolveAfter && resolveAfter > closeTime ? resolveAfter : closeTime,
      });
    }
  }
  return open;
}

async function main(): Promise<void> {
  const now = Date.now();

  let ids: string[];
  try {
    ids = await fetchMarketIds();
  } catch (error) {
    await notify(
      `[CRITICAL] Pado prediction: market list unavailable (${
        error instanceof Error ? error.message : String(error)
      }). Discovery is blind; keeper/lp/arb cannot see markets.`,
    );
    process.exit(0);
  }

  if (ids.length === 0) {
    await notify('[CRITICAL] Pado prediction: market list returned 0 markets. Discovery is blind.');
    process.exit(0);
  }

  const client = new SuiClient({ url: RPC_URL });
  const open = await fetchOpenMarkets(client, ids);

  const stale = open.filter((m) => now - m.resolvableFrom > STALE_CLOSE_HOURS * 3_600_000);
  const nearDeadline = open.filter(
    (m) => m.resolveDeadline > now && m.resolveDeadline - now < DEADLINE_WARN_HOURS * 3_600_000,
  );
  const expired = open.filter((m) => m.resolveDeadline <= now);

  const lines: string[] = [];
  if (expired.length > 0) {
    lines.push(
      `[CRITICAL] ${expired.length} market(s) past resolve_deadline and still OPEN (refund-only unless the keeper cancels them):`,
      ...expired.slice(0, 5).map((m) => `  ${m.id.slice(0, 12)} ${m.question}`),
    );
  }
  // Report on the markets that are still resolvable; the expired ones are
  // already covered above. Comparing counts instead would let a batch whose
  // deadline sits close behind ResolveAfter mask a genuine settlement stall.
  const pending = stale.filter((m) => m.resolveDeadline > now);
  if (pending.length > 0) {
    lines.push(
      `[WARNING] ${pending.length} market(s) resolvable >${STALE_CLOSE_HOURS}h ago and still unresolved:`,
      ...pending.slice(0, 5).map((m) => `  ${m.id.slice(0, 12)} ${m.question}`),
    );
  }
  if (nearDeadline.length > 0) {
    lines.push(
      `[WARNING] ${nearDeadline.length} OPEN market(s) hit resolve_deadline within ${DEADLINE_WARN_HOURS}h.`,
    );
  }

  if (lines.length === 0) {
    console.log(
      `OK: ${ids.length} indexed, ${open.length} open, none stale (>${STALE_CLOSE_HOURS}h) or near deadline (<${DEADLINE_WARN_HOURS}h)`,
    );
    return;
  }

  await notify(['Pado prediction watchdog', ...lines].join('\n'));
}

main().catch((error) => {
  console.error('prediction-watchdog failed:', error);
  process.exit(1);
});
