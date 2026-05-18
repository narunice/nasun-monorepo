/**
 * Music chart resolver via Apple Music RSS.
 *
 * Snapshot-at-deadline semantics: at ResolveAfter, fetch the chart, locate
 * TrackId in the array, and evaluate `position == 1` (string comparison;
 * track IDs are 10-digit JSON strings that exceed Number.MAX_SAFE_INTEGER
 * boundary safety).
 *
 * Required env:
 *   ITUNES_RSS_BASE  default https://rss.marketingtools.apple.com
 *                   (canonical host post-301 from rss.applemarketingtools.com)
 */

import type { ResolveResult } from './types.js';

const TRACK_ID_RE = /^[0-9]{6,12}$/;
const COUNTRY_RE = /^[a-z]{2}$/;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;
const ALLOWED_CHARTS = new Set(['most-played', 'top-albums', 'coming-soon']);
const ALLOWED_PROVIDERS = new Set(['itunes_rss']);
const ALLOWED_FIELDS = new Set(['position']);

export interface MusicCriteria {
  provider: 'itunes_rss';
  country: string;            // 2-letter lowercase
  chart: string;              // most-played / ...
  trackId: string;            // numeric string
  resolveAfter: number;
  field: 'position';
  comparisonOp: '==' | '<=';
  threshold: number;          // 1-based rank threshold
  tieBreak: boolean;
}

export class MusicParseError extends Error {}

function readLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function parseUtcDateLine(value: string): number {
  const m = ISO_UTC_RE.exec(value);
  if (!m) throw new MusicParseError(`bad UTC timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  if (!Number.isFinite(ms)) throw new MusicParseError(`unparseable UTC: ${value}`);
  return ms;
}

export function parseMusicCriteria(text: string): MusicCriteria {
  const provider = readLine(text, 'Provider');
  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    throw new MusicParseError(`unsupported Provider: ${provider}`);
  }
  const country = readLine(text, 'Country');
  if (!country || !COUNTRY_RE.test(country)) throw new MusicParseError(`bad Country: ${country}`);
  const chart = readLine(text, 'Chart');
  if (!chart || !ALLOWED_CHARTS.has(chart)) throw new MusicParseError(`unsupported Chart: ${chart}`);

  const trackId = readLine(text, 'TrackId');
  if (!trackId || !TRACK_ID_RE.test(trackId)) throw new MusicParseError(`bad TrackId: ${trackId}`);

  const resolveAfterRaw = readLine(text, 'ResolveAfter');
  if (!resolveAfterRaw) throw new MusicParseError('missing ResolveAfter');
  const resolveAfter = parseUtcDateLine(resolveAfterRaw);

  const field = readLine(text, 'Field');
  if (!field || !ALLOWED_FIELDS.has(field)) throw new MusicParseError(`unsupported Field: ${field}`);

  const cmp = readLine(text, 'Comparison');
  // Accept e.g. "position == 1" or "position <= 10".
  const cmpMatch = /^position\s*(==|<=)\s*(\d{1,3})$/.exec(cmp ?? '');
  if (!cmpMatch) throw new MusicParseError(`bad Comparison: ${cmp}`);
  const comparisonOp = cmpMatch[1] as '==' | '<=';
  const threshold = Number(cmpMatch[2]);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
    throw new MusicParseError(`bad threshold: ${cmpMatch[2]}`);
  }

  const tieBreakRaw = readLine(text, 'TieBreak') ?? 'NO';
  if (tieBreakRaw !== 'YES' && tieBreakRaw !== 'NO') {
    throw new MusicParseError(`bad TieBreak: ${tieBreakRaw}`);
  }

  return {
    provider: 'itunes_rss',
    country,
    chart,
    trackId,
    resolveAfter,
    field: 'position',
    comparisonOp,
    threshold,
    tieBreak: tieBreakRaw === 'YES',
  };
}

interface ITunesEntry {
  id: string;
  name: string;
  artistName: string;
}

interface ITunesResponse {
  feed?: { results?: ITunesEntry[] };
}

async function fetchChart(country: string, chart: string): Promise<ITunesEntry[]> {
  const base = process.env.ITUNES_RSS_BASE || 'https://rss.marketingtools.apple.com';
  // limit fixed at 10 for the music #1 / top-10 markets supported in v1.
  const url = `${base}/api/v2/${encodeURIComponent(country)}/music/${encodeURIComponent(chart)}/10/songs.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`iTunes RSS HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as ITunesResponse;
  return body.feed?.results ?? [];
}

export async function resolveMusic(criteria: MusicCriteria, now: number): Promise<ResolveResult> {
  if (process.env.MUSIC_RESOLVER_DISABLED === 'true') {
    return { state: 'pending', reason: 'MUSIC_RESOLVER_DISABLED' };
  }
  if (now < criteria.resolveAfter) {
    return { state: 'pending', reason: 'before ResolveAfter' };
  }

  let entries: ITunesEntry[];
  try {
    entries = await fetchChart(criteria.country, criteria.chart);
  } catch (err) {
    return { state: 'pending', reason: `itunes fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (entries.length === 0) {
    return { state: 'pending', reason: 'empty chart response' };
  }

  // String equality on JSON `id`; never Number() cast.
  const idx = entries.findIndex((e) => String(e.id) === criteria.trackId);
  const position = idx === -1 ? null : idx + 1;
  if (position === null) {
    // Not in chart at all.
    const outcome = criteria.comparisonOp === '==' ? false : false;
    return {
      state: 'resolved',
      outcome,
      evidence: `track ${criteria.trackId} not in top-${entries.length} chart`,
    };
  }

  const outcome = criteria.comparisonOp === '=='
    ? position === criteria.threshold
    : position <= criteria.threshold;

  return {
    state: 'resolved',
    outcome,
    evidence: `position=${position} threshold=${criteria.threshold} op=${criteria.comparisonOp}`,
  };
}
