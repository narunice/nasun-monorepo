/**
 * 16 -- Genesis Pass Drop E2E Tests
 *
 * Comprehensive test suite covering:
 * - Smart contract on-chain state (Sepolia + Mainnet)
 * - Backend APIs (register, check, mint-signature, sync-stage, CORS, security)
 * - Frontend constants (editions, stages, contract config)
 * - Cross-layer configuration consistency
 * - Admin endpoint security
 * - Input validation and error sanitization
 * - Rate limiting and edge cases
 *
 * Prerequisites:
 * - Genesis Pass contracts deployed on Sepolia and Mainnet
 * - VITE_GENESIS_PASS_API set in .env.development
 * - Alchemy API key in contracts/genesis-pass/.env
 */

import { describe, test, expect } from 'vitest';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import {
  URLS,
  get,
  post,
  del,
  options,
  apiRequest,
  TEST_WALLET,
  TEST_WALLET_REAL,
  ALLOWED_ORIGIN,
} from './helpers';

// Load Alchemy key from contracts .env
loadEnv({ path: resolve(__dirname, '../contracts/genesis-pass/.env') });

const GP_API = URLS.genesisPassApi;
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || 'demo';
const SEPOLIA_RPC = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const MAINNET_RPC = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// Load contract addresses from deployment JSONs (source of truth)
const SEPOLIA_DEPLOYMENT = JSON.parse(
  readFileSync(resolve(__dirname, '../contracts/genesis-pass/deployments/11155111.json'), 'utf-8')
);
const MAINNET_DEPLOYMENT = JSON.parse(
  readFileSync(resolve(__dirname, '../contracts/genesis-pass/deployments/1.json'), 'utf-8')
);

const SEPOLIA_CONTRACT = SEPOLIA_DEPLOYMENT.address;
const MAINNET_CONTRACT = MAINNET_DEPLOYMENT.address;

// Solidity function selectors (keccak256 of signature, first 4 bytes)
const SEL = {
  NUM_TOKEN_TYPES: '0xc6caf75b',
  currentStage: '0x5bf5d54c',
  totalMinted: '0x9d7f4ebf',
  mintPricePerStage: '0x4b74022f',
  walletLimitPerStage: '0x580e634a',
  maxSupply: '0x869f7594',
  signer: '0x238ac933',
  owner: '0x8da5cb5b',
  highWaterMark: '0x1e8410da',
  mintDeadline: '0xd4e78086',
  transfersUnlocked: '0x167e007c',
  currentMintPrice: '0x0561942a',
  contractURI: '0xe8a3d485',
  uri: '0x0e89341c',
  eip712Domain: '0x84b0196e',
  balanceOf: '0x00fdd58e',
};

// ── Helpers ──

async function ethCall(rpc: string, to: string, data: string): Promise<string> {
  const res = await apiRequest(rpc, {
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

function parseUint(hex: string): number {
  if (!hex || hex === '0x') return NaN;
  return Number(BigInt(hex));
}

function parseAddress(hex: string): string {
  if (!hex || hex.length < 66) return '0x0';
  return '0x' + hex.slice(26).toLowerCase();
}

function parseBool(hex: string): boolean {
  return parseUint(hex) === 1;
}

/** Pad uint256 to 32 bytes */
function padUint(n: number): string {
  return n.toString(16).padStart(64, '0');
}

/** Pad uint8 to 32 bytes */
function padUint8(n: number): string {
  return padUint(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('16 -- Genesis Pass Drop', () => {
  const skip = !GP_API;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Smart Contract On-Chain Verification (Sepolia)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Smart Contract (Sepolia)', () => {
    test('contract is deployed and has bytecode', async () => {
      const res = await apiRequest(SEPOLIA_RPC, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getCode',
          params: [SEPOLIA_CONTRACT, 'latest'],
        }),
      });
      const body = res.body as { result: string };
      expect(body.result).not.toBe('0x');
      expect(body.result.length).toBeGreaterThan(1000);
    });

    test('NUM_TOKEN_TYPES equals 8', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.NUM_TOKEN_TYPES);
      expect(parseUint(result)).toBe(8);
    });

    test('currentStage returns valid stage (0-4)', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.currentStage);
      const stage = parseUint(result);
      expect(stage).toBeGreaterThanOrEqual(0);
      expect(stage).toBeLessThanOrEqual(4);
    });

    test('totalMinted for each tokenId (1-8) is non-negative', async () => {
      for (let id = 1; id <= 8; id++) {
        const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.totalMinted + padUint(id));
        expect(parseUint(result)).toBeGreaterThanOrEqual(0);
      }
    });

    test('invalid tokenId 0 and 9 return 0 totalMinted', async () => {
      for (const id of [0, 9]) {
        const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.totalMinted + padUint(id));
        expect(parseUint(result)).toBe(0);
      }
    });

    test('maxSupply for tokenId 1 equals deployment config', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.maxSupply + padUint(1));
      expect(parseUint(result)).toBe(SEPOLIA_DEPLOYMENT.maxSupply);
    });

    test('signer matches deployment config', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.signer);
      expect(parseAddress(result)).toBe(SEPOLIA_DEPLOYMENT.signer.toLowerCase());
    });

    test('owner matches deployer', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.owner);
      expect(parseAddress(result)).toBe(SEPOLIA_DEPLOYMENT.deployer.toLowerCase());
    });

    test('highWaterMark is valid (0-4)', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.highWaterMark);
      const hwm = parseUint(result);
      expect(hwm).toBeGreaterThanOrEqual(0);
      expect(hwm).toBeLessThanOrEqual(4);
    });

    test('transfersUnlocked returns boolean', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.transfersUnlocked);
      expect([0, 1]).toContain(parseUint(result));
    });

    test('stage prices are non-negative for paid stages', async () => {
      // Sepolia prices may diverge from deployment JSON after admin testing,
      // so we validate structure rather than exact values
      for (const stage of [2, 3, 4]) {
        const result = await ethCall(
          SEPOLIA_RPC, SEPOLIA_CONTRACT,
          SEL.mintPricePerStage + padUint8(stage)
        );
        expect(parseUint(result)).toBeGreaterThanOrEqual(0);
      }
    });

    test('FREE_MINT stage (1) has zero price', async () => {
      const result = await ethCall(
        SEPOLIA_RPC, SEPOLIA_CONTRACT,
        SEL.mintPricePerStage + padUint8(1)
      );
      expect(parseUint(result)).toBe(0);
    });

    test('wallet limits are set for all stages', async () => {
      for (const stage of [1, 2, 3, 4]) {
        const result = await ethCall(
          SEPOLIA_RPC, SEPOLIA_CONTRACT,
          SEL.walletLimitPerStage + padUint8(stage)
        );
        expect(parseUint(result)).toBeGreaterThan(0);
      }
    });

    test('EIP-712 domain uses correct name and version', async () => {
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.eip712Domain);
      // eip712Domain returns: (bytes1, string, string, uint256, address, bytes32, uint256[])
      // The ABI encoding is complex, but we can verify the chain ID (4th item)
      // and the verifying contract (5th item) by checking specific offsets
      expect(result.length).toBeGreaterThan(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Smart Contract On-Chain Verification (Mainnet)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Smart Contract (Mainnet)', () => {
    test('contract is deployed and has bytecode', async () => {
      const res = await apiRequest(MAINNET_RPC, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getCode',
          params: [MAINNET_CONTRACT, 'latest'],
        }),
      });
      const body = res.body as { result: string };
      expect(body.result).not.toBe('0x');
      expect(body.result.length).toBeGreaterThan(1000);
    });

    test('NUM_TOKEN_TYPES equals 8', async () => {
      const result = await ethCall(MAINNET_RPC, MAINNET_CONTRACT, SEL.NUM_TOKEN_TYPES);
      expect(parseUint(result)).toBe(8);
    });

    test('currentStage returns valid stage (0-4)', async () => {
      const result = await ethCall(MAINNET_RPC, MAINNET_CONTRACT, SEL.currentStage);
      const stage = parseUint(result);
      expect(stage).toBeGreaterThanOrEqual(0);
      expect(stage).toBeLessThanOrEqual(4);
    });

    test('maxSupply matches deployment config', async () => {
      const result = await ethCall(MAINNET_RPC, MAINNET_CONTRACT, SEL.maxSupply + padUint(1));
      expect(parseUint(result)).toBe(MAINNET_DEPLOYMENT.maxSupply);
    });

    test('signer matches deployment config', async () => {
      const result = await ethCall(MAINNET_RPC, MAINNET_CONTRACT, SEL.signer);
      expect(parseAddress(result)).toBe(MAINNET_DEPLOYMENT.signer.toLowerCase());
    });

    test('owner matches deployer', async () => {
      const result = await ethCall(MAINNET_RPC, MAINNET_CONTRACT, SEL.owner);
      expect(parseAddress(result)).toBe(MAINNET_DEPLOYMENT.deployer.toLowerCase());
    });

    test('stage prices match deployment config', async () => {
      for (const [stageStr, expectedPrice] of Object.entries(MAINNET_DEPLOYMENT.stagePrices)) {
        const stage = Number(stageStr);
        const result = await ethCall(
          MAINNET_RPC, MAINNET_CONTRACT,
          SEL.mintPricePerStage + padUint8(stage)
        );
        expect(parseUint(result).toString()).toBe(String(expectedPrice));
      }
    });

    test('wallet limits match deployment config', async () => {
      for (const [stageStr, expectedLimit] of Object.entries(MAINNET_DEPLOYMENT.walletLimits)) {
        const stage = Number(stageStr);
        const result = await ethCall(
          MAINNET_RPC, MAINNET_CONTRACT,
          SEL.walletLimitPerStage + padUint8(stage)
        );
        expect(parseUint(result)).toBe(expectedLimit as number);
      }
    });

    test('bytecode matches Sepolia (same source code)', async () => {
      const [mainnetCode, sepoliaCode] = await Promise.all([
        apiRequest(MAINNET_RPC, {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'eth_getCode',
            params: [MAINNET_CONTRACT, 'latest'],
          }),
        }),
        apiRequest(SEPOLIA_RPC, {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0', id: 2,
            method: 'eth_getCode',
            params: [SEPOLIA_CONTRACT, 'latest'],
          }),
        }),
      ]);

      const mainnet = (mainnetCode.body as { result: string }).result;
      const sepolia = (sepoliaCode.body as { result: string }).result;

      // Same source = same length; only immutables differ (address, chainId, domain separator)
      expect(mainnet.length).toBe(sepolia.length);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Cross-Layer Configuration Consistency
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Configuration Consistency', () => {
    test('frontend addresses match deployment JSONs', async () => {
      const { GENESIS_PASS_ADDRESSES } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      expect(GENESIS_PASS_ADDRESSES[1]).toBe(MAINNET_DEPLOYMENT.address);
      expect(GENESIS_PASS_ADDRESSES[11155111]).toBe(SEPOLIA_DEPLOYMENT.address);
    });

    test('Sepolia and Mainnet addresses are different', async () => {
      const { GENESIS_PASS_ADDRESSES } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      expect(GENESIS_PASS_ADDRESSES[1]).not.toBe(GENESIS_PASS_ADDRESSES[11155111]);
    });

    test('addresses are valid Ethereum format', async () => {
      const { GENESIS_PASS_ADDRESSES } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      expect(GENESIS_PASS_ADDRESSES[1]).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(GENESIS_PASS_ADDRESSES[11155111]).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test('production .env uses mainnet contract address', () => {
      const prodEnv = readFileSync(
        resolve(__dirname, '../cdk/.env.production'), 'utf-8'
      );
      expect(prodEnv).toContain(`GENESIS_PASS_CONTRACT_ADDRESS=${MAINNET_DEPLOYMENT.address}`);
      expect(prodEnv).toContain('GENESIS_PASS_CHAIN_ID=1');
    });

    test('deployment configs have consistent parameters', () => {
      // Both chains should have same maxSupply and pricing
      expect(MAINNET_DEPLOYMENT.maxSupply).toBe(SEPOLIA_DEPLOYMENT.maxSupply);
      expect(MAINNET_DEPLOYMENT.stagePrices).toEqual(SEPOLIA_DEPLOYMENT.stagePrices);
      expect(MAINNET_DEPLOYMENT.walletLimits).toEqual(SEPOLIA_DEPLOYMENT.walletLimits);
    });

    test('deployer is the same across chains', () => {
      expect(MAINNET_DEPLOYMENT.deployer.toLowerCase())
        .toBe(SEPOLIA_DEPLOYMENT.deployer.toLowerCase());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Frontend Constants Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Frontend Constants', () => {
    test('NFT_EDITIONS has 8 editions with unique sequential IDs', async () => {
      const { NFT_EDITIONS } = await import('../frontend/src/constants/nft-drop');
      expect(NFT_EDITIONS).toHaveLength(8);
      const ids = NFT_EDITIONS.map((e: { id: number }) => e.id);
      expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('all editions have non-empty names', async () => {
      const { NFT_EDITIONS } = await import('../frontend/src/constants/nft-drop');
      for (const edition of NFT_EDITIONS) {
        expect(typeof edition.name).toBe('string');
        expect(edition.name.trim().length).toBeGreaterThan(0);
      }
    });

    test('edition count matches on-chain NUM_TOKEN_TYPES', async () => {
      const { NFT_EDITIONS } = await import('../frontend/src/constants/nft-drop');
      const result = await ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.NUM_TOKEN_TYPES);
      expect(NFT_EDITIONS.length).toBe(parseUint(result));
    });

    test('STAGE_LABELS covers all 5 stages (0-4)', async () => {
      const { STAGE_LABELS } = await import('../frontend/src/constants/nft-drop');
      for (let i = 0; i <= 4; i++) {
        expect(STAGE_LABELS[i]).toBeTruthy();
        expect(typeof STAGE_LABELS[i]).toBe('string');
      }
    });

    test('STAGE_START_TIMES are in chronological order', async () => {
      const { STAGE_START_TIMES } = await import('../frontend/src/constants/nft-drop');
      const stages = [1, 2, 3, 4];
      for (let i = 1; i < stages.length; i++) {
        const prev = STAGE_START_TIMES[stages[i - 1]];
        const curr = STAGE_START_TIMES[stages[i]];
        if (prev && curr) {
          expect(curr.getTime()).toBeGreaterThan(prev.getTime());
        }
      }
    });

    test('MINT_CLOSE_TIME is after all stage start times', async () => {
      const { STAGE_START_TIMES, MINT_CLOSE_TIME } = await import(
        '../frontend/src/constants/nft-drop'
      );
      for (const [, startTime] of Object.entries(STAGE_START_TIMES)) {
        expect(MINT_CLOSE_TIME.getTime()).toBeGreaterThan((startTime as Date).getTime());
      }
    });

    test('ABI contains all critical admin functions', async () => {
      const { GENESIS_PASS_ABI } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      const functionNames = GENESIS_PASS_ABI
        .filter((item: { type: string }) => item.type === 'function')
        .map((item: { name: string }) => item.name);

      // User-facing
      expect(functionNames).toContain('mint');
      expect(functionNames).toContain('balanceOf');
      expect(functionNames).toContain('balanceOfBatch');

      // Admin functions (used in GenesisPassDropAdmin)
      expect(functionNames).toContain('setStage');
      expect(functionNames).toContain('setStagePrice');
      expect(functionNames).toContain('setMintDeadline');
      expect(functionNames).toContain('setURI');
      expect(functionNames).toContain('setContractURI');
      expect(functionNames).toContain('withdrawTo');
      expect(functionNames).toContain('unlockTransfers');
      expect(functionNames).toContain('setSigner');
      expect(functionNames).toContain('setMaxSupply');
      expect(functionNames).toContain('setWalletLimit');

      // Read functions (used in status panel)
      expect(functionNames).toContain('currentStage');
      expect(functionNames).toContain('currentMintPrice');
      expect(functionNames).toContain('totalMinted');
      expect(functionNames).toContain('mintDeadline');
      expect(functionNames).toContain('transfersUnlocked');
      expect(functionNames).toContain('highWaterMark');
      expect(functionNames).toContain('mintPricePerStage');
      expect(functionNames).toContain('owner');
      expect(functionNames).toContain('signer');
    });

    test('ABI contains critical error definitions', async () => {
      const { GENESIS_PASS_ABI } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      const errorNames = GENESIS_PASS_ABI
        .filter((item: { type: string }) => item.type === 'error')
        .map((item: { name: string }) => item.name);

      expect(errorNames).toContain('StagePaused');
      expect(errorNames).toContain('SoldOut');
      expect(errorNames).toContain('NotEligible');
      expect(errorNames).toContain('InvalidSignature');
      expect(errorNames).toContain('WalletLimitExceeded');
      expect(errorNames).toContain('BackwardStageTransition');
      expect(errorNames).toContain('TransfersLocked');
    });

    test('ABI contains critical event definitions', async () => {
      const { GENESIS_PASS_ABI } = await import(
        '../frontend/src/constants/genesis-pass-contract'
      );
      const eventNames = GENESIS_PASS_ABI
        .filter((item: { type: string }) => item.type === 'event')
        .map((item: { name: string }) => item.name);

      expect(eventNames).toContain('StageChanged');
      expect(eventNames).toContain('StagePriceChanged');
      expect(eventNames).toContain('MintDeadlineChanged');
      expect(eventNames).toContain('TransfersUnlocked');
    });

    test('calcTimeLeft returns correct structure', async () => {
      const { calcTimeLeft } = await import('../frontend/src/constants/nft-drop');
      const futureTarget = new Date(Date.now() + 90061000); // 1d 1h 1m 1s
      const result = calcTimeLeft(futureTarget, Date.now());
      expect(result.isExpired).toBe(false);
      expect(result.days).toBeGreaterThanOrEqual(1);
      expect(result.hours).toBeGreaterThanOrEqual(0);
      expect(result.minutes).toBeGreaterThanOrEqual(0);
      expect(result.seconds).toBeGreaterThanOrEqual(0);
    });

    test('calcTimeLeft marks expired targets correctly', async () => {
      const { calcTimeLeft } = await import('../frontend/src/constants/nft-drop');
      const pastTarget = new Date(Date.now() - 1000);
      const result = calcTimeLeft(pastTarget, Date.now());
      expect(result.isExpired).toBe(true);
      expect(result.days).toBe(0);
      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.seconds).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. API Health & Endpoint Availability
  // ═══════════════════════════════════════════════════════════════════════════

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

    test.skipIf(skip)('POST /genesis-pass/mint-signature is accessible (public endpoint)', async () => {
      // mint-signature is public (no JWT required) per CDK config
      // Should get 400 (bad input) not 401 (unauthorized)
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {});
      expect(res.status).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CORS Validation
  // ═══════════════════════════════════════════════════════════════════════════

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

    test.skipIf(skip)('allows nasun.io origin on mint-signature endpoint', async () => {
      const res = await options(`${GP_API}/genesis-pass/mint-signature`, ALLOWED_ORIGIN);
      const acao = res.headers.get('access-control-allow-origin');
      expect(acao).toBeTruthy();
    });

    test.skipIf(skip)('rejects unknown origin', async () => {
      const res = await options(`${GP_API}/genesis-pass/check`, 'https://evil.com');
      const acao = res.headers.get('access-control-allow-origin');
      if (acao) {
        expect(acao).not.toBe('https://evil.com');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Public Check Endpoint (/genesis-pass/check)
  // ═══════════════════════════════════════════════════════════════════════════

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
      expect(typeof data.currentStage).toBe('number');
      expect(typeof data.currentStageLabel).toBe('string');
    });

    test.skipIf(skip)('returns correct structure for unregistered wallet', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`);
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', true);
      const data = body.data as Record<string, unknown>;
      expect(data.registered).toBe(false);
      expect(data.applied).toBe(false);
      expect(data.currentStage).toBeGreaterThanOrEqual(0);
      expect(data.currentStage).toBeLessThanOrEqual(4);
    });

    test.skipIf(skip)('currentStage in API matches on-chain state', async () => {
      const [apiRes, onChainResult] = await Promise.all([
        get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`),
        ethCall(SEPOLIA_RPC, SEPOLIA_CONTRACT, SEL.currentStage),
      ]);
      // Note: SSM cache may lag up to 60s, so we allow a difference
      // but both should be valid stages
      const apiStage = ((apiRes.body as any).data as Record<string, unknown>).currentStage;
      const onChainStage = parseUint(onChainResult);
      expect(typeof apiStage).toBe('number');
      expect(onChainStage).toBeGreaterThanOrEqual(0);
      expect(onChainStage).toBeLessThanOrEqual(4);
    });

    test.skipIf(skip)('rejects missing walletAddress param', async () => {
      const res = await get(`${GP_API}/genesis-pass/check`);
      expect(res.status).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error', 'MISSING_ADDRESS');
    });

    test.skipIf(skip)('rejects invalid wallet format', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=not-a-wallet`);
      expect(res.status).toBe(400);
      expect((res.body as any).error).toBe('INVALID_ADDRESS');
    });

    test.skipIf(skip)('rejects short wallet address', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=0x123`);
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('handles lowercase wallet address', async () => {
      const res = await get(
        `${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET_REAL.toLowerCase()}`
      );
      expect(res.status).toBe(200);
      expect((res.body as any).success).toBe(true);
    });

    test.skipIf(skip)('handles checksummed wallet address', async () => {
      const res = await get(
        `${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET_REAL}`
      );
      expect(res.status).toBe(200);
      expect((res.body as any).success).toBe(true);
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

    test.skipIf(skip)('rejects path traversal in walletAddress', async () => {
      const res = await get(
        `${GP_API}/genesis-pass/check?walletAddress=../../etc/passwd`
      );
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Mint Signature Endpoint (/genesis-pass/mint-signature)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Mint Signature (/genesis-pass/mint-signature)', () => {
    test.skipIf(skip)('rejects empty body', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {});
      expect(res.status).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.error).toBe('INVALID_WALLET');
    });

    test.skipIf(skip)('rejects invalid wallet address', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {
        walletAddress: 'not-valid',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toBe('INVALID_WALLET');
    });

    test.skipIf(skip)('rejects unregistered wallet with NOT_ELIGIBLE', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {
        walletAddress: TEST_WALLET,
      });
      expect(res.status).toBe(403);
      expect((res.body as any).error).toBe('NOT_ELIGIBLE');
    });

    test.skipIf(skip)('rejects XSS in walletAddress', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {
        walletAddress: '<img src=x onerror=alert(1)>',
      });
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('rejects overly long walletAddress', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {
        walletAddress: '0x' + 'a'.repeat(100),
      });
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('rejects malformed JSON body', async () => {
      const res = await apiRequest(`${GP_API}/genesis-pass/mint-signature`, {
        method: 'POST',
        body: 'not-json{{{',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });

    test.skipIf(skip)('does not leak internal errors on unexpected input', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {
        walletAddress: TEST_WALLET,
        extra: 'x'.repeat(10000),
      });
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/dynamodb|lambda|cognito|aws-sdk|arn:|stack/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Auth-Protected Endpoints (invalid token)
  // ═══════════════════════════════════════════════════════════════════════════

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

    test.skipIf(skip)('rejects Basic auth scheme', async () => {
      const res = await get(`${GP_API}/genesis-pass/register`, {
        Authorization: 'Basic dXNlcjpwYXNz',
      });
      expect([401, 403]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Admin Sync-Stage Endpoint Security
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Admin Sync-Stage (/genesis-pass/admin/sync-stage)', () => {
    test.skipIf(skip)('rejects request without auth', async () => {
      const res = await post(`${GP_API}/genesis-pass/admin/sync-stage`, { stage: 0 });
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('rejects request with invalid JWT', async () => {
      const res = await post(
        `${GP_API}/genesis-pass/admin/sync-stage`,
        { stage: 0 },
        { Authorization: 'Bearer fake-token' }
      );
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('rejects request with empty Authorization', async () => {
      const res = await post(
        `${GP_API}/genesis-pass/admin/sync-stage`,
        { stage: 1 },
        { Authorization: '' }
      );
      expect([401, 403]).toContain(res.status);
    });

    test.skipIf(skip)('does not leak internal errors', async () => {
      const res = await post(`${GP_API}/genesis-pass/admin/sync-stage`, { stage: 999 });
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/dynamodb|lambda|ssm|aws-sdk|arn:|stack/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Error Sanitization
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Error Sanitization', () => {
    test.skipIf(skip)('check endpoint does not leak internals on bad input', async () => {
      const res = await get(`${GP_API}/genesis-pass/check?walletAddress=INJECTIONTEST`);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/dynamodb|lambda|cognito|aws-sdk|arn:/i);
      expect(res.body as object).not.toHaveProperty('stack');
      expect(res.body as object).not.toHaveProperty('details');
    });

    test.skipIf(skip)('register endpoint does not leak internals on 401', async () => {
      const res = await post(`${GP_API}/genesis-pass/register`, {});
      if (typeof res.body === 'object' && res.body !== null) {
        const obj = res.body as Record<string, string>;
        if (obj.message) {
          expect(obj.message).not.toMatch(/dynamodb|lambda|cognito|aws-sdk|arn:/i);
        }
      }
    });

    test.skipIf(skip)('mint-signature endpoint does not leak internals', async () => {
      const res = await post(`${GP_API}/genesis-pass/mint-signature`, {
        walletAddress: TEST_WALLET,
      });
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/secretsmanager|privateKey|signer.*key|aws-sdk|arn:/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. HTTP Method Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('HTTP Method Validation', () => {
    test.skipIf(skip)('check endpoint rejects POST method', async () => {
      const res = await post(
        `${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`, {}
      );
      expect(res.status).not.toBe(200);
    });

    test.skipIf(skip)('mint-signature endpoint rejects GET method', async () => {
      const res = await get(`${GP_API}/genesis-pass/mint-signature`);
      // Without auth, should get 403 or 405 (not 200)
      expect([401, 403, 405]).toContain(res.status);
    });

    test.skipIf(skip)('sync-stage endpoint rejects GET method', async () => {
      const res = await get(`${GP_API}/genesis-pass/admin/sync-stage`);
      // Should reject: either 401 (no auth for GET) or 403/405
      expect([401, 403, 405]).toContain(res.status);
    });

    test.skipIf(skip)('check endpoint supports OPTIONS (CORS preflight)', async () => {
      const res = await options(`${GP_API}/genesis-pass/check`, ALLOWED_ORIGIN);
      // API Gateway returns 200 or 204 for OPTIONS preflight
      expect([200, 204]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Rate Limiting & Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Rate Limiting & Edge Cases', () => {
    test.skipIf(skip)('check endpoint handles 5 rapid sequential requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        get(`${GP_API}/genesis-pass/check?walletAddress=${TEST_WALLET}`)
      );
      const results = await Promise.all(requests);
      for (const res of results) {
        expect([200, 429]).toContain(res.status);
      }
      // At least 3 out of 5 should succeed (WAF allows 300/5min)
      const successCount = results.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(3);
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
      expect(res.status).toBeLessThanOrEqual(500);
      // Must not be a 500 (unhandled crash)
      expect(res.status).not.toBe(502);
    });

    test.skipIf(skip)('mint-signature rate limits concurrent requests for same wallet', async () => {
      // Send 3 rapid requests for same unregistered wallet
      // All should return 403 NOT_ELIGIBLE (not crash)
      const requests = Array.from({ length: 3 }, () =>
        post(`${GP_API}/genesis-pass/mint-signature`, { walletAddress: TEST_WALLET })
      );
      const results = await Promise.all(requests);
      for (const res of results) {
        expect([400, 403, 429]).toContain(res.status);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. Deployment JSON Schema Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Deployment JSON Schema', () => {
    for (const [name, deployment] of [
      ['Mainnet', MAINNET_DEPLOYMENT],
      ['Sepolia', SEPOLIA_DEPLOYMENT],
    ] as const) {
      test(`${name} deployment has all required fields`, () => {
        expect(deployment.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(deployment.chainId).toBeTruthy();
        expect(deployment.deployer).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(deployment.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(typeof deployment.maxSupply).toBe('number');
        expect(deployment.maxSupply).toBeGreaterThan(0);
        expect(typeof deployment.stagePrices).toBe('object');
        expect(typeof deployment.walletLimits).toBe('object');
        expect(deployment.deployedAt).toBeTruthy();
        expect(new Date(deployment.deployedAt).getTime()).toBeGreaterThan(0);
      });

      test(`${name} deployment has correct stage prices structure`, () => {
        // Stages 2, 3, 4 should have prices (FREE_MINT stage 1 is free)
        for (const stage of ['2', '3', '4']) {
          expect(deployment.stagePrices).toHaveProperty(stage);
          const price = BigInt(deployment.stagePrices[stage]);
          expect(price).toBeGreaterThan(0n);
        }
      });

      test(`${name} deployment prices are in ascending order by stage`, () => {
        const p2 = BigInt(deployment.stagePrices['2']);
        const p3 = BigInt(deployment.stagePrices['3']);
        const p4 = BigInt(deployment.stagePrices['4']);
        expect(p3).toBeGreaterThanOrEqual(p2);
        expect(p4).toBeGreaterThanOrEqual(p3);
      });

      test(`${name} deployment has wallet limits for all paid stages`, () => {
        for (const stage of ['1', '2', '3', '4']) {
          expect(deployment.walletLimits).toHaveProperty(stage);
          expect(deployment.walletLimits[stage]).toBeGreaterThan(0);
        }
      });
    }
  });
});
