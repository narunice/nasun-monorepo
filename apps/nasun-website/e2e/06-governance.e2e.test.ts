import { describe, test, expect } from 'vitest';
import { URLS, get, post, TEST_WALLET, TEST_WALLET_REAL, TEST_TWITTER_HANDLE } from './helpers';

const GOV = URLS.governance;

describe('06 — Governance Voting Power', () => {
  test('GET /voting-power with twitterHandle returns power breakdown', async () => {
    const res = await get(`${GOV}/voting-power?twitterHandle=${TEST_TWITTER_HANDLE}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('totalVotingPower');
    expect(body).toHaveProperty('breakdown');
    expect(typeof body.totalVotingPower).toBe('number');
  });

  test('GET /voting-power with walletAddress returns power', async () => {
    const res = await get(`${GOV}/voting-power?walletAddress=${TEST_WALLET_REAL}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('totalVotingPower');
  });

  test('GET /voting-power with ethAddress returns power', async () => {
    const res = await get(`${GOV}/voting-power?ethAddress=${TEST_WALLET_REAL}`);
    expect(res.status).toBe(200);
  });

  test('GET /voting-power without params returns 400 or default', async () => {
    const res = await get(`${GOV}/voting-power`);
    expect([200, 400].includes(res.status)).toBe(true);
  });

  test('Breakdown contains expected fields', async () => {
    const res = await get(`${GOV}/voting-power?twitterHandle=${TEST_TWITTER_HANDLE}`);
    if (res.status !== 200) return;
    const body = res.body as Record<string, unknown>;
    const breakdown = body.breakdown as Record<string, unknown>;
    const expectedFields = ['base', 'leaderboard', 'onChain', 'battalionAllowlist', 'genesisAllowlist'];
    for (const field of expectedFields) {
      expect(breakdown).toHaveProperty(field);
    }
  });
});

describe('06 — Governance Certificate', () => {
  test('POST /certificate with missing voter returns 400', async () => {
    const res = await post(`${GOV}/certificate`, {
      proposalId: 'some-proposal-id',
      twitterHandle: TEST_TWITTER_HANDLE,
    });
    expect(res.status).toBe(400);
  });

  test('POST /certificate with missing proposalId returns 400', async () => {
    const res = await post(`${GOV}/certificate`, {
      voter: TEST_WALLET,
      twitterHandle: TEST_TWITTER_HANDLE,
    });
    expect(res.status).toBe(400);
  });

  test('POST /certificate with empty body returns 400', async () => {
    const res = await post(`${GOV}/certificate`, {});
    expect(res.status).toBe(400);
  });
});

describe('06 — Governance Sponsor', () => {
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
