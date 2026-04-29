/**
 * Nasun Stats Snapshot Builder (runs inside user-analytics-collector).
 *
 * 1. Consumes wallet sets already built during UserProfiles scan.
 * 2. POSTs wallet arrays to explorer-api /api/v1/stats/nasun-metrics.
 * 3. Formats CSV (time series) and TXT (snapshot summary) matching the
 *    `.claude/skills/nasun-stats` skill's output.
 * 4. Writes a single DynamoDB item at pk=NASUN_STATS_DOWNLOAD / sk=LATEST so
 *    admin-api can serve downloads without any recomputation.
 *
 * All heavy work (postgres CTEs) runs on explorer-api. This Lambda only
 * prepares wallet sets and formats the response.
 */

import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface WalletSets {
  any: Set<string>;
  x: Set<string>;
  google: Set<string>;
  telegram: Set<string>;
  multi: Set<string>;
  totalProfiles: number;
}

interface DailyRow {
  date: string;
  dau: number;
  newAddresses: number;
  returningAddresses: number;
  returningPct: number | null;
  uniqueTraders: number;
  uniqueGamers: number;
  verifiedUniqueTraders: number;
  verifiedUniqueGamers: number;
  dauXSocial: number;
  dauGoogleSocial: number;
  dauTelegramSocial: number;
  dauAnySocial: number;
  dauNoSocial: number;
  mission1: number;
  mission2: number;
  mission3: number;
  mission4: number;
  mission5: number;
  mission6plus: number;
}

interface ExplorerResponse {
  dateFrom: string;
  dateTo: string;
  reportBaseDate: string;
  today: string;
  daily: DailyRow[];
  socialCounts: { total: number; x: number; google: number; telegram: number; any: number; multi: number };
  newUserQuality: { newTotal: number; newVerified: number; newVerifiedRate: number | null };
  topActivities: Array<{ category: string; uniqueUsers: number }>;
  catStats: Array<{ category: string; total: number; verified: number; returning: number; retentionD1: number }>;
  grpStats: Array<{ group: 'DEX' | 'GAMES'; total: number; verified: number; returning: number; retentionD1: number }>;
  missionDist: { m1: number; m2: number; m3: number; m4: number; m5: number; m6plus: number; total: number };
  peakDau: { date: string; dau: number } | null;
  avgDau: number;
  avgReturningPct: number;
  activeDays: number;
  generatedAt: string;
}

const CSV_HEADER =
  'date,dau,new_addresses,returning_addresses,returning_pct,unique_traders,unique_gamers,' +
  'verified_unique_traders,verified_unique_gamers,dau_x_social,dau_google_social,dau_telegram_social,' +
  'dau_any_social,dau_no_social,mission_1,mission_2,mission_3,mission_4,mission_5,mission_6plus';

const DATE_FROM = '2026-03-05';
const HTTP_TIMEOUT_MS = 240_000;
const TABLE_NAME = process.env.DEVNET_METRICS_TABLE || 'devnet-metrics';

// Preferred ordering of individual categories in TXT output (matches skill).
const PREFERRED_CATS = [
  'pado-dex',
  'gostop-lottery',
  'gostop-scratchcard',
  'gostop-numbermatch',
  'gostop-mines',
  'gostop-crash',
  'faucet',
  'wallet-transfer',
  'chat',
  'staking',
  'staking-daily',
  'staking-reward',
];

export async function fetchNasunMetrics(
  wallets: WalletSets,
  apiBase: string,
  apiKey: string,
  dateTo: string,
): Promise<ExplorerResponse> {
  const body = JSON.stringify({
    dateFrom: DATE_FROM,
    dateTo,
    walletsAny: Array.from(wallets.any),
    walletsX: Array.from(wallets.x),
    walletsGoogle: Array.from(wallets.google),
    walletsTelegram: Array.from(wallets.telegram),
  });
  const url = `${apiBase.replace(/\/$/, '')}/stats/nasun-metrics`;
  const hostHeader = process.env.EXPLORER_API_HOST;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...(hostHeader ? { host: hostHeader } : {}),
    },
    body,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`explorer-api ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as ExplorerResponse;
  // Fill caller-side fields that explorer-api can't compute
  data.socialCounts.total = wallets.totalProfiles;
  data.socialCounts.multi = wallets.multi.size;
  return data;
}

export function buildCsv(r: ExplorerResponse): string {
  const lines = [CSV_HEADER];
  for (const row of r.daily) {
    const pct = row.returningPct == null ? '' : row.returningPct.toFixed(1);
    lines.push(
      [
        row.date,
        row.dau,
        row.newAddresses,
        row.returningAddresses,
        pct,
        row.uniqueTraders,
        row.uniqueGamers,
        row.verifiedUniqueTraders,
        row.verifiedUniqueGamers,
        row.dauXSocial,
        row.dauGoogleSocial,
        row.dauTelegramSocial,
        row.dauAnySocial,
        row.dauNoSocial,
        row.mission1,
        row.mission2,
        row.mission3,
        row.mission4,
        row.mission5,
        row.mission6plus,
      ].join(','),
    );
  }
  // skill CSV has trailing newline
  return lines.join('\n') + '\n';
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'N/A';
}

function rpct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : 'N/A';
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtStatRow(label: string, total: number, verified: number, returning: number, retention: number): string {
  return (
    `  ${label.padEnd(26)} ` +
    `total ${String(fmtInt(total)).padStart(7)}  |  ` +
    `social ${String(fmtInt(verified)).padStart(6)} (${rpct(verified, total).padStart(4)})  |  ` +
    `returning ${String(fmtInt(returning)).padStart(6)} (${rpct(returning, total).padStart(4)})  |  ` +
    `d-1 retained ${String(fmtInt(retention)).padStart(6)} (${rpct(retention, total).padStart(4)})`
  );
}

export function buildTxt(r: ExplorerResponse): string {
  const yesterday = r.reportBaseDate;
  const today = r.today;

  const activeRows = r.daily.filter((x) => x.dau > 0);
  const latestRow = r.daily.find((x) => x.date === yesterday) ?? activeRows[activeRows.length - 1];

  // DAA section
  let daaSection: string;
  if (activeRows.length > 0 && latestRow) {
    const peak = r.peakDau;
    daaSection =
      `-- Devnet DAA (${DATE_FROM} ~ ${yesterday}, ${r.activeDays} active days) --\n` +
      `Yesterday DAA (${latestRow.date}):      ${fmtInt(latestRow.dau)}\n` +
      `  Returning:                         ${fmtInt(latestRow.returningAddresses)}  (${(latestRow.returningPct ?? 0).toFixed(1)}%)\n` +
      `  New:                               ${fmtInt(latestRow.newAddresses)}\n` +
      (peak ? `Peak DAA   (${peak.date}):         ${fmtInt(peak.dau)}\n` : '') +
      `Avg DAA:                             ${fmtInt(r.avgDau)}\n` +
      `Avg returning rate:                  ${r.avgReturningPct.toFixed(1)}%\n` +
      `Yesterday pado-dex  (social verified): ${fmtInt(latestRow.verifiedUniqueTraders)}\n` +
      `Yesterday pado-game (social verified): ${fmtInt(latestRow.verifiedUniqueGamers)}`;
  } else {
    daaSection = `-- Devnet DAA (${DATE_FROM} ~ ${yesterday}) --\nNo active days in this period.`;
  }

  // Website Users section
  const sc = r.socialCounts;
  const usersSection =
    `-- Website Users (DynamoDB, live) --\n` +
    `  X connected:               ${fmtInt(sc.x)}  (${pct(sc.x, sc.total)})\n` +
    `  Google connected:          ${fmtInt(sc.google)}  (${pct(sc.google, sc.total)})\n` +
    `  Telegram joined:           ${fmtInt(sc.telegram)}  (${pct(sc.telegram, sc.total)})\n` +
    `  Any social (union):        ${fmtInt(sc.any)}  (${pct(sc.any, sc.total)})\n` +
    `  2+ social connected:       ${fmtInt(sc.multi)}  (${pct(sc.multi, sc.total)})\n` +
    `Verified wallets (for pado): ${fmtInt(sc.any)}`;

  // Yesterday category breakdown
  const catLines: string[] = [
    `-- Yesterday Category Breakdown (${yesterday}) --`,
    `  (returning = used this category before yesterday; d-1 retained = also used day-before-yesterday)`,
  ];
  const byCat = new Map(r.catStats.map((c) => [c.category, c]));
  const byGrp = new Map(r.grpStats.map((g) => [g.group, g]));
  if (byGrp.has('DEX')) {
    const g = byGrp.get('DEX')!;
    catLines.push(fmtStatRow('[group] DEX', g.total, g.verified, g.returning, g.retentionD1));
  }
  if (byGrp.has('GAMES')) {
    const g = byGrp.get('GAMES')!;
    catLines.push(fmtStatRow('[group] GAMES', g.total, g.verified, g.returning, g.retentionD1));
  }
  const seen = new Set<string>();
  for (const cat of PREFERRED_CATS) {
    const c = byCat.get(cat);
    if (c) {
      catLines.push(fmtStatRow(cat, c.total, c.verified, c.returning, c.retentionD1));
      seen.add(cat);
    }
  }
  const remaining = r.catStats.filter((c) => !seen.has(c.category)).sort((a, b) => b.total - a.total);
  for (const c of remaining) {
    catLines.push(fmtStatRow(c.category, c.total, c.verified, c.returning, c.retentionD1));
  }
  const catSection = catLines.join('\n');

  // Top activities
  const topLines = ['-- Social Users Top Activities --'];
  for (const t of r.topActivities) {
    topLines.push(`  ${t.category.padEnd(32)} ${fmtInt(t.uniqueUsers).padStart(8)} unique users`);
  }
  const topSection = topLines.join('\n');

  // Mission distribution
  const md = r.missionDist;
  const mpct = (n: number) => (md.total > 0 ? `${((n / md.total) * 100).toFixed(1)}%` : 'N/A');
  const missionSection =
    `-- Yesterday Mission Distribution by Verified Users (${yesterday}) --\n` +
    `  1 mission:   ${String(md.m1).padStart(6)}  (${mpct(md.m1)})\n` +
    `  2 missions:  ${String(md.m2).padStart(6)}  (${mpct(md.m2)})\n` +
    `  3 missions:  ${String(md.m3).padStart(6)}  (${mpct(md.m3)})\n` +
    `  4 missions:  ${String(md.m4).padStart(6)}  (${mpct(md.m4)})\n` +
    `  5 missions:  ${String(md.m5).padStart(6)}  (${mpct(md.m5)})\n` +
    `  6+ missions: ${String(md.m6plus).padStart(6)}  (${mpct(md.m6plus)})\n` +
    `  Total active: ${fmtInt(md.total)}`;

  // New user quality
  const nq = r.newUserQuality;
  const nqRate = nq.newTotal > 0 ? `${((nq.newVerified / nq.newTotal) * 100).toFixed(1)}%` : 'N/A';
  const newQuality =
    `-- Today's New User Quality (partial day, ${today}) --\n` +
    `New DAA today:               ${fmtInt(nq.newTotal)}\n` +
    `  Social verified:           ${fmtInt(nq.newVerified)}  (${nqRate})\n`;

  return (
    `==== Nasun Stats Snapshot (${today}, report base = ${yesterday}) ====\n\n` +
    `${daaSection}\n\n` +
    `${usersSection}\n\n` +
    `${catSection}\n\n` +
    `${topSection}\n\n` +
    `${missionSection}\n\n` +
    `${newQuality}`
  );
}

export async function writeSnapshot(
  docClient: DynamoDBDocumentClient,
  csv: string,
  txt: string,
  reportBaseDate: string,
  rowCount: number,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: 'NASUN_STATS_DOWNLOAD',
        sk: 'LATEST',
        csv,
        txt,
        reportBaseDate,
        rowCount,
        generatedAt: new Date().toISOString(),
      },
    }),
  );
}

export function buildNasunStatsSnapshot(
  docClient: DynamoDBDocumentClient,
  wallets: WalletSets,
  apiBase: string,
  apiKey: string,
  dateTo: string,
): Promise<void> {
  return fetchNasunMetrics(wallets, apiBase, apiKey, dateTo).then(async (response) => {
    const csv = buildCsv(response);
    const txt = buildTxt(response);
    await writeSnapshot(docClient, csv, txt, response.reportBaseDate, response.daily.length);
    console.log(
      `[nasun-stats] snapshot saved: reportBase=${response.reportBaseDate} rows=${response.daily.length} csvLen=${csv.length} txtLen=${txt.length}`,
    );
  });
}
