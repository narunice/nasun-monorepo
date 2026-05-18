/**
 * Weather resolver via Open-Meteo Archive API.
 *
 * Snapshot semantics (ResolveAfter = endDate + 24h or later):
 *   archive-api.open-meteo.com returns daily aggregates per location for a
 *   date range. Each market specifies a target metric, aggregation, and
 *   threshold; the resolver fetches once after ResolveAfter and compares.
 *
 * Supported Field values:
 *   temperature_max_over   Aggregation: max | mean       Threshold: degrees C
 *   precipitation_sum_over Aggregation: sum | max        Threshold: mm
 *   rainy_days_over        Aggregation: count            Threshold: integer days
 *                          (counts days with precipitation_sum > 1 mm)
 *
 * Open-Meteo archive completeness (Phase 0.4 baseline): non-null values
 * available from T-12h for Seoul/Tokyo. v1 uses +24h ResolveAfter to be safe.
 *
 * Single source — Open-Meteo internally aggregates ECMWF/NOAA. No cross-check
 * (the API does not give multiple model votes in a single response).
 *
 * Required env: none (Open-Meteo is unauthenticated, no rate limit published).
 */

import type { ResolveResult } from './types.js';

const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COORD_NAME_RE = /^[A-Za-z0-9 ,.\-]{1,40}$/;

type WeatherField = 'temperature_max_over' | 'precipitation_sum_over' | 'rainy_days_over';
type WeatherAggregation = 'max' | 'mean' | 'sum' | 'count';

export interface WeatherCriteria {
  provider: 'open-meteo';
  latitude: number;
  longitude: number;
  locationName: string;
  startDate: string;
  endDate: string;
  resolveAfter: number;
  field: WeatherField;
  aggregation: WeatherAggregation;
  threshold: number;
  tieBreak: boolean;
}

export class WeatherParseError extends Error {}

function readLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function parseUtcDateLine(value: string): number {
  const m = ISO_UTC_RE.exec(value);
  if (!m) throw new WeatherParseError(`bad UTC timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  if (!Number.isFinite(ms)) throw new WeatherParseError(`unparseable UTC: ${value}`);
  return ms;
}

export function parseWeatherCriteria(text: string): WeatherCriteria {
  const provider = readLine(text, 'Provider');
  if (provider !== 'open-meteo') throw new WeatherParseError(`unsupported Provider: ${provider}`);

  const lat = Number(readLine(text, 'Latitude'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new WeatherParseError(`bad Latitude: ${lat}`);
  const lon = Number(readLine(text, 'Longitude'));
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new WeatherParseError(`bad Longitude: ${lon}`);

  const locationName = readLine(text, 'LocationName') ?? '';
  if (!COORD_NAME_RE.test(locationName)) throw new WeatherParseError(`bad LocationName: ${locationName}`);

  const startDate = readLine(text, 'StartDate');
  if (!startDate || !ISO_DATE_RE.test(startDate)) throw new WeatherParseError(`bad StartDate: ${startDate}`);
  const endDate = readLine(text, 'EndDate');
  if (!endDate || !ISO_DATE_RE.test(endDate)) throw new WeatherParseError(`bad EndDate: ${endDate}`);

  const resolveAfterRaw = readLine(text, 'ResolveAfter');
  if (!resolveAfterRaw) throw new WeatherParseError('missing ResolveAfter');
  const resolveAfter = parseUtcDateLine(resolveAfterRaw);

  const fieldRaw = readLine(text, 'Field') as WeatherField | null;
  if (fieldRaw !== 'temperature_max_over' && fieldRaw !== 'precipitation_sum_over' && fieldRaw !== 'rainy_days_over') {
    throw new WeatherParseError(`unsupported Field: ${fieldRaw}`);
  }
  const aggRaw = readLine(text, 'Aggregation') as WeatherAggregation | null;
  if (aggRaw !== 'max' && aggRaw !== 'mean' && aggRaw !== 'sum' && aggRaw !== 'count') {
    throw new WeatherParseError(`unsupported Aggregation: ${aggRaw}`);
  }

  const thrRaw = readLine(text, 'Threshold');
  const threshold = Number(thrRaw);
  if (!Number.isFinite(threshold) || threshold < -100 || threshold > 1000) {
    throw new WeatherParseError(`bad Threshold: ${thrRaw}`);
  }

  const tieBreakRaw = readLine(text, 'TieBreak') ?? 'NO';
  if (tieBreakRaw !== 'YES' && tieBreakRaw !== 'NO') {
    throw new WeatherParseError(`bad TieBreak: ${tieBreakRaw}`);
  }

  return {
    provider: 'open-meteo',
    latitude: lat,
    longitude: lon,
    locationName,
    startDate,
    endDate,
    resolveAfter,
    field: fieldRaw,
    aggregation: aggRaw,
    threshold,
    tieBreak: tieBreakRaw === 'YES',
  };
}

const VARIABLE_FOR_FIELD: Record<WeatherField, 'temperature_2m_max' | 'precipitation_sum'> = {
  temperature_max_over: 'temperature_2m_max',
  precipitation_sum_over: 'precipitation_sum',
  rainy_days_over: 'precipitation_sum',
};

const finalCache = new Map<string, number[]>();
const failureBackoff = new Map<string, { until: number; reason: string }>();
const FAILURE_BACKOFF_MS = 5 * 60_000;

export function _clearWeatherCaches(): void {
  finalCache.clear();
  failureBackoff.clear();
}

function cacheKey(c: WeatherCriteria): string {
  return `${c.latitude}|${c.longitude}|${c.startDate}|${c.endDate}|${VARIABLE_FOR_FIELD[c.field]}`;
}

async function fetchDaily(c: WeatherCriteria): Promise<number[]> {
  const key = cacheKey(c);
  const cached = finalCache.get(key);
  if (cached) return cached;
  const now = Date.now();
  const backoff = failureBackoff.get(key);
  if (backoff && now < backoff.until) {
    throw new Error(`open-meteo backoff: ${backoff.reason}`);
  }

  const variable = VARIABLE_FOR_FIELD[c.field];
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${c.latitude}&longitude=${c.longitude}` +
    `&start_date=${encodeURIComponent(c.startDate)}&end_date=${encodeURIComponent(c.endDate)}` +
    `&daily=${variable}&timezone=UTC`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    failureBackoff.set(key, { until: now + FAILURE_BACKOFF_MS, reason: 'network error' });
    throw err;
  }
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      failureBackoff.set(key, { until: now + FAILURE_BACKOFF_MS, reason: `HTTP ${res.status}` });
    }
    throw new Error(`open-meteo HTTP ${res.status}`);
  }
  const body = (await res.json()) as { daily?: Record<string, Array<number | null>> };
  failureBackoff.delete(key);

  const series = body.daily?.[variable] ?? [];
  if (series.some((v) => v === null || v === undefined)) {
    // archive incomplete; do not cache.
    throw new Error(`open-meteo daily series incomplete for ${variable} ${c.startDate}~${c.endDate}`);
  }
  const numeric = series as number[];
  finalCache.set(key, numeric);
  return numeric;
}

function aggregate(series: number[], agg: WeatherAggregation, field: WeatherField): number {
  if (field === 'rainy_days_over') {
    // count days with precipitation_sum > 1mm
    return series.filter((v) => v > 1).length;
  }
  switch (agg) {
    case 'max': return Math.max(...series);
    case 'mean': return series.reduce((a, b) => a + b, 0) / series.length;
    case 'sum': return series.reduce((a, b) => a + b, 0);
    case 'count': return series.length;
  }
}

export async function resolveWeather(criteria: WeatherCriteria, now: number): Promise<ResolveResult> {
  if (process.env.WEATHER_RESOLVER_DISABLED === 'true') {
    return { state: 'pending', reason: 'WEATHER_RESOLVER_DISABLED' };
  }
  if (now < criteria.resolveAfter) {
    return { state: 'pending', reason: 'before ResolveAfter' };
  }
  let series: number[];
  try {
    series = await fetchDaily(criteria);
  } catch (err) {
    return { state: 'pending', reason: `open-meteo fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (series.length === 0) return { state: 'pending', reason: 'empty daily series' };

  const value = aggregate(series, criteria.aggregation, criteria.field);
  const outcome = value > criteria.threshold;
  return {
    state: 'resolved',
    outcome,
    evidence: `${criteria.field}/${criteria.aggregation}(${criteria.startDate}..${criteria.endDate})=${value.toFixed(2)} threshold=${criteria.threshold}`,
  };
}
