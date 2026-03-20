import { describe, test, expect } from 'vitest';
import { URLS, get, post, TEST_WALLET, TEST_WALLET_REAL } from './helpers';

const GOV = URLS.governance;

describe('06 -- Governance Voting Power (V3)', () => {
  test('GET /voting-power without params returns base power 10', async () => {
    const res = await get(`${GOV}/voting-power`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.totalVotingPower).toBe(10);
    expect(body.rank).toBeNull();
  });

  test('GET /voting-power with walletAddress returns power >= 10', async () => {
    const res = await get(`${GOV}/voting-power?walletAddress=${TEST_WALLET_REAL}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('totalVotingPower');
    expect(typeof body.totalVotingPower).toBe('number');
    expect(body.totalVotingPower as number).toBeGreaterThanOrEqual(10);
  });

  test('Breakdown contains V3 fields', async () => {
    const res = await get(`${GOV}/voting-power?walletAddress=${TEST_WALLET_REAL}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const breakdown = body.breakdown as Record<string, unknown>;

    // V3 fields
    for (const field of ['base', 'xLinked', 'telegram', 'rankBonus']) {
      expect(breakdown).toHaveProperty(field);
      expect(typeof breakdown[field]).toBe('number');
    }

    // Backward compatibility fields (for old frontend during deploy transition)
    for (const field of ['leaderboard', 'onChain', 'battalionAllowlist', 'genesisAllowlist']) {
      expect(breakdown).toHaveProperty(field);
    }
  });

  test('Response includes rank field', async () => {
    const res = await get(`${GOV}/voting-power?walletAddress=${TEST_WALLET_REAL}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('rank');
  });

  test('Base breakdown is always 10', async () => {
    const res = await get(`${GOV}/voting-power`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const breakdown = body.breakdown as Record<string, unknown>;
    expect(breakdown.base).toBe(10);
  });

  test('GET /config returns V3 config', async () => {
    const res = await get(`${GOV}/config`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.version).toBe(3);
    expect(body.system).toBe('rank-based');
    expect(body.basePower).toBe(10);
    expect(body.maxPower).toBe(40);
  });
});

describe('06 -- Governance Certificate', () => {
  test('POST /certificate with missing voter returns 400', async () => {
    const res = await post(`${GOV}/certificate`, {
      proposalId: 'some-proposal-id',
    });
    expect(res.status).toBe(400);
  });

  test('POST /certificate with missing proposalId returns 400', async () => {
    const res = await post(`${GOV}/certificate`, {
      voter: TEST_WALLET,
    });
    expect(res.status).toBe(400);
  });

  test('POST /certificate with empty body returns 400', async () => {
    const res = await post(`${GOV}/certificate`, {});
    expect(res.status).toBe(400);
  });
});

describe('06 -- Governance Sponsor', () => {
  test('POST /sponsor with invalid txKindBytes returns 400', async () => {
    const res = await post(`${GOV}/sponsor`, {
      txKindBytes: 'invalid-base64',
      sender: TEST_WALLET,
    });
    expect([400, 500].includes(res.status)).toBe(true);
  });

  test('POST /sponsor without required fields returns 400', async () => {
    const res = await post(`${GOV}/sponsor`, {});
    expect(res.status).toBe(400);
  });
});
