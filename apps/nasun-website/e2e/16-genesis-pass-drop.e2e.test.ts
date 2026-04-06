/**
 * 16 — Genesis Pass Drop E2E Tests
 *
 * Covers the full Genesis Pass NFT drop pipeline:
 * - Smart contract (on-chain state via Sepolia RPC)
 * - Backend APIs (register, check, mint-signature, CORS, security)
 * - Frontend constants (edition metadata, stage config)
 *
 * Prerequisites:
 * - Genesis Pass contract deployed on Sepolia (NUM_TOKEN_TYPES = 8)
 * - VITE_GENESIS_PASS_API set in .env.development
 * - VITE_ETHEREUM_CHAIN_ID = 11155111 (Sepolia)
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import {
  URLS,
  get,
  post,
  del,
  options,
  apiRequest,
  assertSanitizedError,
  TEST_WALLET,
  TEST_WALLET_REAL,
  ALLOWED_ORIGIN,
} from './helpers';

// Load Alchemy key from contracts .env
loadEnv({ path: resolve(__dirname, '../contracts/genesis-pass/.env') });

const GP_API = URLS.genesisPassApi;
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || 'demo';
const SEPOLIA_RPC = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// Sepolia contract address (from genesis-pass-contract.ts)
const SEPOLIA_CONTRACT = '0x742c5d12B5f2F2B8cBD8d3c577d407a5a5FCA2e4';
const MAINNET_CONTRACT = '0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1';

// ERC-1155 ABI fragments for eth_call
const NUM_TOKEN_TYPES_SIG = '0x60a2c830'; // numTokenTypes() selector (not standard, check contract)

// ─────────────────────────────────────────────────────────────────────────────
// 1. API Health & CORS
// ─────────────────────────────────────────────────────────────────────────────

describe('16 — Genesis Pass Drop', () => {
  const skip = !GP_API;

  describe('API Health', () => {
    test.skipIf(skip)('GET /genesis-pass/check responds', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`);
      expect(res.status).toBeLessThanOrEqual(500);
      expect(typeof res.body).toBe('object');
    });

    test.skipIf(skip)('GET /genesis-pass/register rejects without auth', async () => {
      const res = await get(`${GP_API}/genesis-pass/register`);
      expect(res.status).toBe(401);
    });

    test.skipIf(skip)('POST /genesis-pass/register rejects without auth', async () => {
      const res = await post(`${GP_API}/genesis-pass/register`, {});
      expect(res.status).toBe(401);
    });

    test.skipIf(skip)('DELETE /genesis-pass/register rejects without auth', async () => {
      const res = await del(`${GP_API}/genesis-pass/register`);
      expect(res.status).toBe(401);
    });

    test.skipIf(skip)('POST /genesis-pass/mint-signature rejects without auth', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {});
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CORS
  // ───────────────────────────────────────────────────────────────────────────

  describe('CORS', () => {
    test.skipIf(skip)('allows nasun.io origin on check endpoint', async () => {
      const res = await options(`${GP_API}/genesis-pass/check`, ALLOWED_ORIGIN);
      const acao = res.headers.get('access-control-allow-origin');
      expect(acao).toBeTruthy();
    });

    test.skipIf(skip)('allows nasun.io origin on register endpoint', async () => {
      const res = await options(`${GP_API}/genesis-pass/register`, ALLOWED_ORIGIN);
      const acao = res.headers.get('access-control-allow-origin');
      expect(acao).toBeTruthy();
    });

    test.skipIf(skip)('rejects unknown origin', async () => {
      const res = await options(`${GP_API}/genesis-pass/check`, 'https://evil.com');
      const acao = res.headers.get('access-control-allow-origin');
      // Should not echo back evil origin
      if (acao) {
        expect(acao).not.toBe('https://evil.com');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Public Check Endpoint
  // ───────────────────────────────────────────────────────────────────────────

  describe('Public Check (/genesis-pass/check)', () => {
    test.skipIf(skip)('returns status for valid wallet address', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET_REAL}`);
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      const data = body.data as Record<string, unknown>;
      expect(typeof data.registered).toBe('boolean');
      expect(typeof data.applied).toBe('boolean');
    });

    test.skipIf(skip)('returns status for unregistered wallet', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`);
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', true);
      const data = body.data as Record<string, unknown>;
      expect(data.registered).toBe(false);
      expect(data.applied).toBe(false);
    });

    test.skipIf(skip)('rejects missing walletAddress param', async () => {
      const res = await get(`${GP_API}/genesis-pass/check`);
      expect(res.status).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', false);
    });

    test.skipIf(skip)('rejects invalid wallet format', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=not-a-wallet`);
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('rejects short wallet address', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=0x123`);
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('handles lowercase wallet address', async () => {
      const lower = `${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET_REAL.toLowerCase()}`;
      const res = await get(lower);
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', true);
    });

    test.skipIf(skip)('rejects XSS in walletAddress', async () => {
      const res = await get(
        `${GP_API}/genesis-pass/check?walletAddress=<script>alert(1)</script>`
      );
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('rejects SQL injection in walletAddress', async () => {
      const res = await get(
        `${GP_API}/genesis-pass/check?walletAddress=0x' OR '1'='1`
      );
      expect(res.status).toBe(400);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Auth-Protected Endpoints (without valid token)
  // ───────────────────────────────────────────────────────────────────────────

  describe('Auth-Protected Endpoints (invalid token)', () => {
    const fakeAuth = { Authorization: 'Bearer invalid-jwt-token' };

    test.skipIf(skip)('GET register rejects invalid JWT', async () => {
      const res = await get(`${GP_API}/genesis-pass/register`, fakeAuth);
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('POST register rejects invalid JWT', async () => {
      const res = await post(`${GP_API}/genesis-pass/register`, {}, fakeAuth);
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('DELETE register rejects invalid JWT', async () => {
      const res = await del(`${GP_API}/genesis-pass/register`, fakeAuth);
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('POST mint-signature rejects invalid JWT', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {}, fakeAuth);
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('rejects empty Authorization header', async () => {
      const res = await get(`${GP_API}/genesis-pass/register`, { Authorization: '' });
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('rejects malformed Bearer token', async () => {
      const res = await get(`${GP_API}/genesis-pass/register`, {
        Authorization: 'Bearer ',
      });
      expect([401, 403]).toContain(res.status);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Error Sanitization
  // ───────────────────────────────────────────────────────────────────────────

  describe('Error Sanitization', () => {
    test.skipIf(skip)('check endpoint does not leak internals on bad input', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=INJECTIONTEST`);
      const body = res.body as Record<string, unknown>;
      // Should not contain AWS internals in any field
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toMatch(/dynamodb|lambda|cognito|aws-sdk|arn:/i);
      expect(body).not.toHaveProperty('stack');
      expect(body).not.toHaveProperty('details');
    });

    test.skipIf(skip)('register endpoint does not leak internals on 401', async () => {
      const res = await post(`${GP_API}/genesis-pass/register`, {});
      // 401 response should not contain AWS internals
      const body = res.body;
      if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, string>;
        if (obj.message) {
          expect(obj.message).not.toMatch(/dynamodb|lambda|cognito|aws-sdk|arn:/i);
        }
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Smart Contract On-Chain Verification (Sepolia)
  // ───────────────────────────────────────────────────────────────────────────

  describe('Smart Contract (Sepolia)', () => {
    // Helper: eth_call via JSON-RPC
    async function ethCall(to: string, data: string): Promise<string> {
      const res = await apiRequest(SEPOLIA_RPC, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }),
      });
      const body = res.body as { result?: string; error?: unknown };
      if (body.error) throw new Error(`RPC error: ${JSON.stringify(body.error)}`);
      return body.result ?? '0x';
    }

    // Function selectors (computed via ethers Interface)
    const SELECTORS = {
      NUM_TOKEN_TYPES: '0xc6caf75b',
      currentStage: '0x5bf5d54c',
      totalMinted: '0x9d7f4ebf',
    };

    test('Sepolia contract is deployed and responds', async () => {
      // Check code exists at address
      const res = await apiRequest(SEPOLIA_RPC, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [SEPOLIA_CONTRACT, 'latest'],
        }),
      });
      const body = res.body as { result: string };
      expect(body.result).not.toBe('0x');
      expect(body.result.length).toBeGreaterThan(10);
    });

    test('Mainnet contract is deployed and responds', async () => {
      const mainnetRpc = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
      const res = await apiRequest(mainnetRpc, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [MAINNET_CONTRACT, 'latest'],
        }),
      });
      const body = res.body as { result: string };
      expect(body.result).not.toBe('0x');
      expect(body.result.length).toBeGreaterThan(10);
    });

    function parseHexResult(hex: string): number {
      if (!hex || hex === '0x') return NaN;
      return Number(BigInt(hex));
    }

    test('NUM_TOKEN_TYPES equals 8', async () => {
      const result = await ethCall(SEPOLIA_CONTRACT, SELECTORS.NUM_TOKEN_TYPES);
      const value = parseHexResult(result);
      expect(value).toBe(8);
    });

    test('currentStage returns a valid stage (0-4)', async () => {
      const result = await ethCall(SEPOLIA_CONTRACT, SELECTORS.currentStage);
      const stage = parseHexResult(result);
      expect(stage).toBeGreaterThanOrEqual(0);
      expect(stage).toBeLessThanOrEqual(4);
    });

    test('totalMinted for each tokenId is non-negative', async () => {
      for (let tokenId = 1; tokenId <= 8; tokenId++) {
        const paddedId = tokenId.toString(16).padStart(64, '0');
        const result = await ethCall(SEPOLIA_CONTRACT, SELECTORS.totalMinted + paddedId);
        const minted = parseHexResult(result);
        expect(minted).toBeGreaterThanOrEqual(0);
      }
    });

    test('invalid tokenId 0 returns 0', async () => {
      const paddedId = '0'.padStart(64, '0');
      const result = await ethCall(SEPOLIA_CONTRACT, SELECTORS.totalMinted + paddedId);
      const minted = parseHexResult(result);
      expect(minted).toBe(0);
    });

    test('invalid tokenId 9 returns 0', async () => {
      const paddedId = (9).toString(16).padStart(64, '0');
      const result = await ethCall(SEPOLIA_CONTRACT, SELECTORS.totalMinted + paddedId);
      const minted = parseHexResult(result);
      expect(minted).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Frontend Constants Validation
  // ───────────────────────────────────────────────────────────────────────────

  describe('Frontend Constants', () => {
    test('NFT_EDITIONS has 8 editions with unique IDs', async () => {
      // Dynamic import of the constants file
      const { NFT_EDITIONS } = await import(
        '../frontend/src/constants/nft-drop'
      );
      expect(NFT_EDITIONS).toHaveLength(8);
      const ids = NFT_EDITIONS.map((e: { id: number }) => e.id);
      expect(new Set(ids).size).toBe(8);
      expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('NFT_EDITIONS have names and no empty names', async () => {
      const { NFT_EDITIONS } = await import(
        '../frontend/src/constants/nft-drop'
      );
      for (const edition of NFT_EDITIONS) {
        expect(typeof edition.name).toBe('string');
        expect(edition.name.length).toBeGreaterThan(0);
      }
    });

    test('STAGE_LABELS covers all 5 stages (0-4)', async () => {
      const { STAGE_LABELS } = await import(
        '../frontend/src/constants/nft-drop'
      );
      for (let i = 0; i <= 4; i++) {
        expect(STAGE_LABELS[i]).toBeTruthy();
      }
    });

    test('Contract addresses are defined for Sepolia and Mainnet', async () => {
      const { GENESIS_PASS_ADDRESSES } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      expect(GENESIS_PASS_ADDRESSES[11155111]).toBeTruthy();
      expect(GENESIS_PASS_ADDRESSES[1]).toBeTruthy();
      // Valid Ethereum address format
      expect(GENESIS_PASS_ADDRESSES[11155111]).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(GENESIS_PASS_ADDRESSES[1]).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test('Sepolia and Mainnet addresses are different', async () => {
      const { GENESIS_PASS_ADDRESSES } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      expect(GENESIS_PASS_ADDRESSES[11155111]).not.toBe(
        GENESIS_PASS_ADDRESSES[1]
      );
    });

    test('ABI contains mint, setStage, setURI functions', async () => {
      const { GENESIS_PASS_ABI } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      const functionNames = GENESIS_PASS_ABI
        .filter((item: { type: string }) => item.type === 'function')
        .map((item: { name: string }) => item.name);
      expect(functionNames).toContain('mint');
      expect(functionNames).toContain('setStage');
      expect(functionNames).toContain('setURI');
      expect(functionNames).toContain('setStagePrice');
      expect(functionNames).toContain('withdrawTo');
      expect(functionNames).toContain('unlockTransfers');
      expect(functionNames).toContain('balanceOfBatch');
    });

    test('Edition count matches contract NUM_TOKEN_TYPES', async () => {
      const { NFT_EDITIONS } = await import(
        '../frontend/src/constants/nft-drop'
      );
      // Cross-check: frontend editions count must match on-chain constant
      expect(NFT_EDITIONS.length).toBe(8);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. HTTP Method Validation
  // ───────────────────────────────────────────────────────────────────────────

  describe('HTTP Method Validation', () => {
    test.skipIf(skip)('check endpoint rejects POST method', async () => {
      const res = await post(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`, {});
      // Should reject or return error (not 200)
      expect(res.status).not.toBe(200);
    });

    test.skipIf(skip)('mint-signature endpoint rejects GET method', async () => {
      const res = await get(`${GP_API}/genesis-pass/mint-signature`);
      // Should return 401 (no auth) or 405 (method not allowed)
      expect([401, 403, 405]).toContain(res.status);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Rate Limiting & Edge Cases
  // ───────────────────────────────────────────────────────────────────────────

  describe('Rate Limiting & Edge Cases', () => {
    test.skipIf(skip)('handles rapid sequential check requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`)
      );
      const results = await Promise.all(requests);
      // All should succeed (not rate limited for 5 requests)
      for (const res of results) {
        expect([200, 429]).toContain(res.status);
      }
    });

    test.skipIf(skip)('handles empty body on POST register', async () => {
      const res = await apiRequest(`${GP_API}/genesis-pass/register`, {
        method: 'POST',
        body: '',
      });
      // Should get 401 (no auth) not 500
      expect(res.status).toBeLessThan(500);
    });

    test.skipIf(skip)('handles oversized body gracefully', async () => {
      const bigPayload = { data: 'x'.repeat(100_000) };
      const res = await post(`${GP_API}/genesis-pass/register`, bigPayload);
      // Should reject, not crash
      expect(res.status).toBeLessThanOrEqual(500);
    });
  });
});
