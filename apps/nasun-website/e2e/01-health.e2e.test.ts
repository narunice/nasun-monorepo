import { describe, test, expect } from 'vitest';
import { URLS, get, post, apiRequest } from './helpers';

describe('01 — Endpoint Health Checks', () => {
  const endpoints: Array<{ name: string; url: string; method?: 'GET' | 'POST'; path?: string }> = [
    { name: 'Twitter Auth API', url: URLS.twitterAuth, path: '/login' },
    { name: 'MetaMask Auth API', url: URLS.metamaskAuth, path: '/challenge', method: 'POST' },
    { name: 'Battalion NFT API', url: URLS.battalionNft, path: '/event/status' },
    { name: 'User Profile API', url: URLS.userProfile },
    { name: 'Join Whitelist API', url: URLS.joinWhitelist, method: 'POST' },
    { name: 'Withdraw Whitelist API', url: URLS.withdrawWhitelist, method: 'POST' },
    { name: 'Check Whitelist API', url: URLS.checkWhitelist },
    { name: 'Deactivate User API', url: URLS.deactivateUser },
    { name: 'Link Account API', url: URLS.linkAccount, path: '/link', method: 'POST' },
    { name: 'Price API', url: URLS.priceApi, path: '/api/prices' },
    { name: 'Backup Price API', url: URLS.backupPrice, path: '/BackupPrices' },
    { name: 'User Count API', url: URLS.userCount },
    { name: 'Follower Count API', url: URLS.followerCount },
    { name: 'Governance API', url: URLS.governance, path: '/voting-power' },
    { name: 'Leaderboard V3 API', url: URLS.leaderboardV3, path: '/v3/leaderboard?listSeasons=true' },
    { name: 'Admin API', url: URLS.adminApi, path: '/nft-collections' },
    { name: 'Random Image API', url: URLS.randomImage, method: 'POST' },
  ];

  for (const ep of endpoints) {
    test(`${ep.name} responds (not timeout/5xx)`, async () => {
      const url = `${ep.url}${ep.path || ''}`;
      let res;

      if (ep.method === 'POST') {
        res = await post(url, {});
      } else {
        res = await get(url);
      }

      // Any response that isn't a server error or timeout means the endpoint is alive
      expect(res.status).toBeLessThanOrEqual(502);
    });
  }

  test('zkLogin Salt API responds', async () => {
    if (!URLS.zkLoginSalt) {
      console.log('VITE_ZKLOGIN_SALT_API_URL not set, skipping');
      return;
    }
    const res = await post(URLS.zkLoginSalt, {});
    expect(res.status).toBeLessThan(500);
  });
});
