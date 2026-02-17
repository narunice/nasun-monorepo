import { describe, test, expect } from 'vitest';
import { URLS, get, TEST_TWITTER_HANDLE } from './helpers';

const LB = URLS.leaderboardV3;

describe('05 — Leaderboard V3 Seasons', () => {
  let activeSeasonId: string | undefined;

  test('GET /v3/leaderboard?listSeasons=true returns seasons array', async () => {
    const res = await get(`${LB}/v3/leaderboard?listSeasons=true`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('seasons');
    const seasons = body.seasons as Array<Record<string, unknown>>;
    expect(Array.isArray(seasons)).toBe(true);

    if (seasons.length > 0) {
      expect(seasons[0]).toHaveProperty('seasonId');
      expect(seasons[0]).toHaveProperty('name');
      // Save active season for subsequent tests
      const active = seasons.find((s) => s.status === 'active');
      if (active) activeSeasonId = active.seasonId as string;
    }
  });

  test('GET /v3/leaderboard with seasonId returns rankings', async () => {
    if (!activeSeasonId) {
      console.log('No active season found, skipping');
      return;
    }
    const res = await get(`${LB}/v3/leaderboard?seasonId=${activeSeasonId}&limit=10`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('entries');
  });

  test('GET /v3/leaderboard with breakdown=true includes score details', async () => {
    if (!activeSeasonId) return;
    const res = await get(
      `${LB}/v3/leaderboard?seasonId=${activeSeasonId}&limit=5&breakdown=true`
    );
    expect(res.status).toBe(200);
  });

  test('GET /v3/leaderboard with nonexistent seasonId returns empty or 404', async () => {
    const res = await get(`${LB}/v3/leaderboard?seasonId=nonexistent-id&limit=10`);
    expect([200, 400, 404].includes(res.status)).toBe(true);
  });

  test('GET /v3/leaderboard?limit=0 returns 400 or empty', async () => {
    if (!activeSeasonId) return;
    const res = await get(`${LB}/v3/leaderboard?seasonId=${activeSeasonId}&limit=0`);
    expect([200, 400].includes(res.status)).toBe(true);
  });
});

describe('05 — Leaderboard V3 Top Climbers', () => {
  test('GET /v3/leaderboard/top-climbers with params returns data', async () => {
    const seasonsRes = await get(`${LB}/v3/leaderboard?listSeasons=true`);
    const seasons = (seasonsRes.body as Record<string, unknown>).seasons as Array<Record<string, unknown>>;
    const active = seasons?.find((s) => s.status === 'active');
    if (!active) {
      console.log('No active season, skipping top-climbers test');
      return;
    }

    const res = await get(
      `${LB}/v3/leaderboard/top-climbers?seasonId=${active.seasonId}&range=7d&limit=5`
    );
    expect(res.status).toBe(200);
  });
});

describe('05 — Leaderboard V3 Featured Feed', () => {
  test('GET /v3/feed/featured returns data', async () => {
    const seasonsRes = await get(`${LB}/v3/leaderboard?listSeasons=true`);
    const seasons = (seasonsRes.body as Record<string, unknown>).seasons as Array<Record<string, unknown>>;
    const active = seasons?.find((s) => s.status === 'active');
    if (!active) return;

    const res = await get(`${LB}/v3/feed/featured?seasonId=${active.seasonId}`);
    expect(res.status).toBe(200);
  });
});

describe('05 — Leaderboard V3 Search', () => {
  test('GET /v3/accounts/search with query returns results', async () => {
    const res = await get(`${LB}/v3/accounts/search?q=test&limit=5`);
    expect(res.status).toBe(200);
  });

  test('GET /v3/accounts/search with single char returns results', async () => {
    const res = await get(`${LB}/v3/accounts/search?q=a&limit=5`);
    expect(res.status).toBe(200);
  });

  test('GET /v3/accounts/search with empty query returns 400 or empty', async () => {
    const res = await get(`${LB}/v3/accounts/search?q=&limit=5`);
    expect([200, 400].includes(res.status)).toBe(true);
  });
});

describe('05 — Leaderboard V3 My Rank', () => {
  test('GET /v3/leaderboard/my-rank with username returns data', async () => {
    const res = await get(`${LB}/v3/leaderboard/my-rank?username=${TEST_TWITTER_HANDLE}`);
    expect([200, 404].includes(res.status)).toBe(true);
  });

  test('GET /v3/leaderboard/my-rank without username returns 400', async () => {
    const res = await get(`${LB}/v3/leaderboard/my-rank`);
    expect(res.status).toBe(400);
  });
});

describe('05 — Leaderboard V3 Rank History', () => {
  test('GET /v3/leaderboard/rank-history with params returns data', async () => {
    const res = await get(
      `${LB}/v3/leaderboard/rank-history?username=${TEST_TWITTER_HANDLE}&days=30`
    );
    expect([200, 404].includes(res.status)).toBe(true);
  });
});
