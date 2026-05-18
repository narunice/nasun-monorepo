/**
 * Open-Meteo Archive latency probe (Phase 0.4, blocking Weather v1.5 entry).
 *
 * For each target date offset (T-12h, T-24h, T-48h, T-72h, T-120h), queries the
 * historical archive API for Seoul + Tokyo daily max temperature and records
 * whether the response is non-null. Appended as JSONL.
 *
 * Decision rule (run for 7 days):
 *   - first non-null offset per day defines the minimum ResolveAfter buffer
 *   - choose max latency across the week as v1.5 ResolveAfter default
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/measure-openmeteo-latency.ts
 *
 * Cron suggestion (daily 00:30 UTC):
 *   30 0 * * *  cd /path/to/repo && node --import tsx apps/pado/bots/scripts/measure-openmeteo-latency.ts >> apps/pado/bots/logs/openmeteo-latency.log 2>&1
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';

// Force IPv4 to avoid happy-eyeballs ETIMEDOUT on environments without IPv6 egress.
setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 8000 } }));

const OUT = 'apps/pado/bots/data/openmeteo-latency.jsonl';
const SITES = [
  { name: 'Seoul', lat: 37.5665, lon: 126.978 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
];
const OFFSETS_HOURS = [12, 24, 48, 72, 120];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function probe(site: { name: string; lat: number; lon: number }, offsetH: number) {
  const target = new Date(Date.now() - offsetH * 3600_000);
  const date = isoDate(target);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${site.lat}&longitude=${site.lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, status: res.status, value: null };
  const body = (await res.json()) as { daily?: { temperature_2m_max?: Array<number | null> } };
  const value = body.daily?.temperature_2m_max?.[0] ?? null;
  return { ok: true, status: 200, value };
}

async function main() {
  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  const ts = new Date().toISOString();
  for (const site of SITES) {
    for (const offsetH of OFFSETS_HOURS) {
      const r = await probe(site, offsetH);
      const row = { ts, site: site.name, offsetH, ...r };
      appendFileSync(OUT, JSON.stringify(row) + '\n');
      console.log(`[openmeteo-latency] ${ts} ${site.name} T-${offsetH}h ok=${r.ok} val=${r.value}`);
    }
  }
}

main().catch((e) => {
  console.error('[openmeteo-latency] FAIL', e);
  process.exit(1);
});
