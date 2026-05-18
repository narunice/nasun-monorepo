/**
 * iTunes Korea chart ID stability probe (Phase 0.3, blocking Music v1 entry).
 *
 * Runs one snapshot of Apple Music KR `most-played` top-10 and appends to
 * `apps/pado/bots/data/itunes-stability.jsonl`. Schedule via cron 4 times
 * across one week (Mon/Wed/Fri/Sun 18:00 KST), then analyze stability of
 * `id` for the same (name, artistName) pair.
 *
 * Decision rule:
 *   - id stable for every recurring track across 4 fetches -> proceed Music v1
 *   - any id flip for a recurring track -> defer Music to v1.5
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/measure-itunes-stability.ts
 *
 * Cron suggestion (KST 18:00 Mon/Wed/Fri/Sun):
 *   0 9 * * 1,3,5,7  cd /path/to/repo && node --import tsx apps/pado/bots/scripts/measure-itunes-stability.ts >> apps/pado/bots/logs/itunes-stability.log 2>&1
 */

import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = 'https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/10/songs.json';
const OUT = 'apps/pado/bots/data/itunes-stability.jsonl';

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { feed?: { results?: Array<{ id: string; name: string; artistName: string }> } };
  const items = body.feed?.results ?? [];
  const snapshot = {
    ts: new Date().toISOString(),
    chart: 'kr.most-played.songs.10',
    items: items.map((r, i) => ({ rank: i, id: String(r.id), name: r.name, artist: r.artistName })),
  };
  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  appendFileSync(OUT, JSON.stringify(snapshot) + '\n');
  console.log(`[itunes-stability] ${snapshot.ts} captured ${items.length} rows -> ${OUT}`);
}

main().catch((e) => {
  console.error('[itunes-stability] FAIL', e);
  process.exit(1);
});
