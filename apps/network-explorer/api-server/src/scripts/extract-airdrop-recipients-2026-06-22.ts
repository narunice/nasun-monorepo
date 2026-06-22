/**
 * Extract leaderboard top-2000 airdrop recipients (2026-06-22, post devnet v8 reset).
 *
 * Builds the union of:
 *   - Pado weekly trading leaderboard top-2000  (chat-server internal API, last
 *     completed ISO week). Each trader row carries the Sui wallet address +
 *     identityId directly; the feed is already registration-gated and
 *     banned-filtered upstream.
 *   - Nasun ecosystem leaderboard top-2000      (weekly_ecosystem_snapshots,
 *     the settled snapshot for the same week). identity_id -> wallet via the
 *     wallet-mappings feed (same source settle-ecosystem uses).
 *
 * Union is deduped by lowercase 0x64 wallet address; a wallet present in both
 * keeps its BEST (lowest) rank. Recipients are bucketed into 4 rank tiers
 * (1-500 / 501-1000 / 1001-1500 / 1501-2000) for tiered payout downstream.
 *
 * Exclusions:
 *   - token admin / airdrop signer 0x98f5339a (never pay ourselves)
 *   - orphan prediction resolver 0xd413721d (operator key)
 *   - admin website identity (ecosystem already drops role=ADMIN; belt+braces)
 *   - banned users (banned_users WHERE unbanned_at IS NULL), by wallet OR identity
 *
 * Output: data/airdrop-top2000-recipients-2026-06-22.json
 *   { meta, recipients: [{ nasun, rank, tier, sources }] }
 * plus a sha256 of the canonical recipient list for reproducibility.
 *
 * Run on node-3 (has POINTS_DATABASE_URL + CHAT_SERVER_URL + INTERNAL_API_KEY +
 * WALLET_MAPPINGS_URL in ~/explorer-api/.env):
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/extract-airdrop-recipients-2026-06-22.ts --week 2026-W25
 */

import postgres from 'postgres';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const gunzipAsync = promisify(gunzip);
const __dir = dirname(fileURLToPath(import.meta.url));

// ===== Config =====
const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const CHAT_SERVER_URL = process.env.CHAT_SERVER_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_API_KEY = process.env.WALLET_MAPPINGS_API_KEY || '';

for (const [k, v] of Object.entries({ POINTS_DB_URL, CHAT_SERVER_URL, INTERNAL_API_KEY, WALLET_MAPPINGS_URL })) {
  if (!v) { console.error(`${k} not set`); process.exit(1); }
}

const args = process.argv.slice(2);
const weekArg = (() => { const i = args.indexOf('--week'); return i >= 0 ? args[i + 1] : 'auto'; })();

// ===== Hard exclusions (operator keys, never recipients) =====
const ADMIN_SIGNER = '0x98f5339a8d5c6ba1c1478d8b405711c816e13250553a2c20ec8b839abf454a6c';
const ORPHAN_RESOLVER = '0xd413721d43dc90a33e9ab8acc4c4db8fbcc4593ea8ff9ea6e8116cd67058e79c';
const ADMIN_IDENTITY = 'ap-northeast-2:6cb1e654-bacf-c1f4-dd7e-9e597940d6dd';
const EXCLUDE_ADDR = new Set([ADMIN_SIGNER, ORPHAN_RESOLVER].map((a) => a.toLowerCase()));
const EXCLUDE_IDENTITY = new Set([ADMIN_IDENTITY]);

// ===== Tier schedule (rank -> tier 1..4) =====
function tierForRank(rank: number): number {
  if (rank <= 500) return 1;
  if (rank <= 1000) return 2;
  if (rank <= 1500) return 3;
  return 4; // 1501-2000
}

// ===== Helpers =====
function normAddr(a: string): string {
  const hex = a.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{1,64}$/.test(hex)) throw new Error(`bad address: ${a}`);
  return '0x' + hex.padStart(64, '0');
}

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}
function getPreviousWeekId(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const { year, week } = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ===== Sources =====
interface PadoTrader { rank: number; address: string; identityId: string | null; hasGenesisPass: boolean; }
interface WeeklyScoresResponse { weekId: string; traders: PadoTrader[]; totalTraders: number; }

async function fetchPado(weekId: string): Promise<PadoTrader[]> {
  const url = `${CHAT_SERVER_URL}/api/pado/internal/weekly-scores/${weekId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${INTERNAL_API_KEY}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Pado weekly API error: ${res.status} ${await res.text().catch(() => '')}`);
  const data = (await res.json()) as WeeklyScoresResponse;
  return data.traders;
}

async function fetchIdentityToWallet(): Promise<Map<string, string>> {
  const headers: Record<string, string> = {};
  if (WALLET_MAPPINGS_API_KEY) headers['x-api-key'] = WALLET_MAPPINGS_API_KEY;
  const res = await fetch(WALLET_MAPPINGS_URL!, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Wallet mappings API error: ${res.status}`);
  let payload = (await res.json()) as { wallets?: Record<string, string>; url?: string };
  if (payload.url) {
    const s3 = await fetch(payload.url, { signal: AbortSignal.timeout(60_000) });
    if (!s3.ok) throw new Error(`Wallet mappings S3 offload error: ${s3.status}`);
    const buf = Buffer.from(await s3.arrayBuffer());
    payload = JSON.parse((await gunzipAsync(buf)).toString('utf8'));
  }
  // payload.wallets: walletAddress -> identityId. Reverse (first wins).
  const map = new Map<string, string>();
  for (const [wallet, identity] of Object.entries(payload.wallets || {})) {
    if (!map.has(identity)) map.set(identity, wallet.toLowerCase());
  }
  return map;
}

// ===== Main =====
async function main() {
  const weekId = weekArg === 'auto' ? getPreviousWeekId() : weekArg;
  if (!/^\d{4}-W\d{2}$/.test(weekId)) { console.error(`Invalid week: ${weekId}`); process.exit(1); }
  console.log(`\n=== Extract airdrop recipients (week ${weekId}) ===\n`);

  // 1. Pado weekly (already registration-gated + banned-filtered upstream)
  console.log('Fetching Pado weekly leaderboard...');
  const padoTraders = await fetchPado(weekId);
  console.log(`  ${padoTraders.length} Pado traders`);

  // 2. Ecosystem settled snapshot + wallet mapping
  const pg = postgres(POINTS_DB_URL!, { max: 3, idle_timeout: 30, connect_timeout: 10 });
  console.log('Reading ecosystem snapshot + wallet mappings...');
  const ecoRows = await pg<Array<{ identity_id: string; rank: number }>>`
    SELECT identity_id, rank FROM weekly_ecosystem_snapshots
    WHERE week_id = ${weekId} ORDER BY rank ASC
  `;
  const id2wallet = await fetchIdentityToWallet();
  console.log(`  ${ecoRows.length} ecosystem snapshot rows | ${id2wallet.size} wallet mappings`);

  // 3. Banned set (currently-banned only)
  const bannedRows = await pg<Array<{ wallet_address: string | null; identity_id: string | null }>>`
    SELECT wallet_address, identity_id FROM banned_users WHERE unbanned_at IS NULL
  `;
  const bannedWallets = new Set<string>();
  const bannedIdentities = new Set<string>();
  for (const b of bannedRows) {
    if (b.wallet_address) bannedWallets.add(normAddr(b.wallet_address));
    if (b.identity_id) bannedIdentities.add(b.identity_id);
  }
  console.log(`  banned: ${bannedWallets.size} wallets, ${bannedIdentities.size} identities (active bans)`);

  // 4. Build union (best rank wins)
  interface U { rank: number; sources: Set<string>; identityId: string | null; }
  const union = new Map<string, U>();
  const add = (addr: string, rank: number, source: string, identityId: string | null) => {
    const cur = union.get(addr);
    if (cur) { if (rank < cur.rank) cur.rank = rank; cur.sources.add(source); if (!cur.identityId && identityId) cur.identityId = identityId; }
    else union.set(addr, { rank, sources: new Set([source]), identityId });
  };

  let padoBad = 0;
  for (const t of padoTraders) {
    try { add(normAddr(t.address), t.rank, 'pado', t.identityId ?? null); } catch { padoBad++; }
  }
  let ecoNoWallet = 0, ecoBad = 0;
  for (const r of ecoRows) {
    const w = id2wallet.get(r.identity_id);
    if (!w) { ecoNoWallet++; continue; }
    try { add(normAddr(w), r.rank, 'ecosystem', r.identity_id); } catch { ecoBad++; }
  }
  console.log(`  union (pre-exclusion): ${union.size}  [pado-bad=${padoBad} eco-nowallet=${ecoNoWallet} eco-bad=${ecoBad}]`);

  // 5. Exclusions
  let exAdmin = 0, exBanned = 0;
  const recipients: Array<{ nasun: string; rank: number; tier: number; sources: string[] }> = [];
  for (const [addr, u] of union) {
    if (EXCLUDE_ADDR.has(addr) || (u.identityId && EXCLUDE_IDENTITY.has(u.identityId))) { exAdmin++; continue; }
    if (bannedWallets.has(addr) || (u.identityId && bannedIdentities.has(u.identityId))) { exBanned++; continue; }
    recipients.push({ nasun: addr, rank: u.rank, tier: tierForRank(u.rank), sources: [...u.sources].sort() });
  }
  recipients.sort((a, b) => a.rank - b.rank || a.nasun.localeCompare(b.nasun));
  console.log(`  excluded: admin/operator=${exAdmin}, banned=${exBanned}`);

  // 6. Summary
  const byTier = [0, 0, 0, 0, 0];
  const bySource = { pado: 0, ecosystem: 0, both: 0 };
  for (const r of recipients) {
    byTier[r.tier]++;
    if (r.sources.length === 2) bySource.both++;
    else if (r.sources[0] === 'pado') bySource.pado++;
    else bySource.ecosystem++;
  }
  console.log(`\n=== RESULT: ${recipients.length} unique recipients ===`);
  console.log(`  tier1 (1-500):    ${byTier[1]}`);
  console.log(`  tier2 (501-1000): ${byTier[2]}`);
  console.log(`  tier3 (1001-1500):${byTier[3]}`);
  console.log(`  tier4 (1501-2000):${byTier[4]}`);
  console.log(`  source: pado-only=${bySource.pado}, ecosystem-only=${bySource.ecosystem}, both=${bySource.both}`);

  // 7. Reproducibility hash over canonical (nasun,tier) list
  const canonical = recipients.map((r) => `${r.nasun}:${r.tier}`).join('\n');
  const sha256 = createHash('sha256').update(canonical).digest('hex');
  console.log(`  sha256(recipients): ${sha256}`);

  const outDir = join(__dir, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'airdrop-top2000-recipients-2026-06-22.json');
  writeFileSync(outPath, JSON.stringify({
    meta: { generatedFor: 'leaderboard-top2000-airdrop-2026-06-22', week: weekId, tierSchedule: 'moderate', count: recipients.length, byTier: byTier.slice(1), bySource, sha256 },
    recipients,
  }, null, 2));
  console.log(`\nWrote ${outPath}`);

  await pg.end();
}

main().catch((e) => { console.error('Fatal:', e instanceof Error ? e.message : e); process.exit(1); });
