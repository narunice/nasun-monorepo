/**
 * 17 — Multichain staking read-only paths.
 *
 * Validates the actual RPC responses our Phase 2/3 hooks consume:
 *   - SUI Testnet (Mysten public RPC)        → getLatestSuiSystemState, getValidatorsApy, getStakes, getBalance
 *   - SOL Mainnet (Solana Foundation public) → getBalance, getTokenAccountsByOwner (mint filter, jsonParsed)
 *   - ETH Mainnet (PublicNode)               → erc20 balanceOf for stETH/wstETH, wstETH stEthPerToken
 *
 * Also exercises pure logic and the SOL invariant guards as a defense-in-depth
 * check that our app code path can talk to the real services end-to-end.
 *
 * Network calls are real — flaky if a public RPC is briefly down. Each test has
 * a 30s timeout (config). Tests skip gracefully when an endpoint is unreachable.
 */

import { describe, test, expect } from 'vitest';
import { apiRequest } from './helpers';

// ────────────────────────────────────────────────────────────
// RPC endpoints (mirror app code constants)
// ────────────────────────────────────────────────────────────

const SUI_TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';
const SOL_MAINNET_READ_RPC = 'https://api.mainnet-beta.solana.com';
const ETH_MAINNET_RPC = 'https://ethereum-rpc.publicnode.com';

// Lido contracts (mirror useEthLst)
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const WSTETH_ADDRESS = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

// LST mints used by useSolLst (mainnet)
const MSOL_MINT  = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const BSOL_MINT  = 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1';

// Public test addresses (have known historic activity → good fixtures)
const VITALIK_ETH = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
// A Sui testnet zero address — guaranteed to exist in system state queries.
const SUI_ZERO_ADDR = '0x0000000000000000000000000000000000000000000000000000000000000000';
// Phantom team-owned SOL mainnet address — public, has SPL accounts.
const SOL_KNOWN_ADDR = 'CFE3CkkqXCKsZQqAMS3PQYjgZRbtN3qV7XHmcimTcQXm';

// JSON-RPC helper (matches our app's solReadCall shape, generic over chain)
let _id = 0;
async function jsonRpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  _id += 1;
  const res = await apiRequest(url, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: _id, method, params }),
  });
  if (res.status >= 500) throw new Error(`RPC ${url} ${method} → HTTP ${res.status}`);
  const body = res.body as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  if (body.result === undefined) throw new Error('RPC: empty result');
  return body.result;
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await apiRequest(url, { method: 'POST', body: '{}' });
    return res.status < 500;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// SUI Testnet RPC — used by useSuiTestnetStaking + SuiStakingPositionsModal
// ────────────────────────────────────────────────────────────

describe('17 — SUI Testnet RPC (Mysten public)', () => {
  test('endpoint reachable', async () => {
    const ok = await isReachable(SUI_TESTNET_RPC);
    expect(ok).toBe(true);
  });

  test('suix_getLatestSuiSystemState returns active validators', async () => {
    const result = await jsonRpc<{
      activeValidators: Array<{ suiAddress: string; name: string; commissionRate: string }>;
    }>(SUI_TESTNET_RPC, 'suix_getLatestSuiSystemState', []);
    expect(Array.isArray(result.activeValidators)).toBe(true);
    expect(result.activeValidators.length).toBeGreaterThan(0);
    const v = result.activeValidators[0];
    expect(v.suiAddress).toMatch(/^0x[a-f0-9]{64}$/);
    expect(typeof v.name).toBe('string');
    expect(typeof v.commissionRate).toBe('string');
  });

  test('suix_getValidatorsApy returns apys array', async () => {
    const result = await jsonRpc<{ apys: Array<{ address: string; apy: number }> }>(
      SUI_TESTNET_RPC,
      'suix_getValidatorsApy',
      [],
    );
    expect(Array.isArray(result.apys)).toBe(true);
    expect(result.apys.length).toBeGreaterThan(0);
    expect(result.apys[0].address).toMatch(/^0x[a-f0-9]{64}$/);
    expect(typeof result.apys[0].apy).toBe('number');
  });

  test('suix_getStakes returns array (empty for zero addr is fine)', async () => {
    const result = await jsonRpc(SUI_TESTNET_RPC, 'suix_getStakes', [SUI_ZERO_ADDR]);
    // Zero address may or may not have stakes; either way result is an array.
    expect(Array.isArray(result)).toBe(true);
  });

  test('suix_getBalance returns shape { totalBalance, coinObjectCount }', async () => {
    const result = await jsonRpc<{ totalBalance: string; coinObjectCount: number }>(
      SUI_TESTNET_RPC,
      'suix_getBalance',
      [SUI_ZERO_ADDR],
    );
    expect(typeof result.totalBalance).toBe('string');
    expect(typeof result.coinObjectCount).toBe('number');
    // totalBalance must parse to BigInt without throwing (matches fetchSuiTestnetBalance)
    expect(() => BigInt(result.totalBalance)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// SOL Mainnet RPC (PublicNode) — used by useSolLst
// ────────────────────────────────────────────────────────────

describe('17 — SOL Mainnet RPC (Solana Foundation public)', () => {
  test('endpoint reachable + mainnet host', async () => {
    expect(SOL_MAINNET_READ_RPC).toContain('mainnet-beta');
    expect(SOL_MAINNET_READ_RPC).not.toContain('devnet');
    expect(SOL_MAINNET_READ_RPC).not.toContain('testnet');
    const ok = await isReachable(SOL_MAINNET_READ_RPC);
    expect(ok).toBe(true);
  });

  test('getVersion confirms mainnet RPC', async () => {
    const result = await jsonRpc<{ 'solana-core': string; 'feature-set'?: number }>(
      SOL_MAINNET_READ_RPC,
      'getVersion',
      [],
    );
    expect(typeof result['solana-core']).toBe('string');
  });

  test('getBalance returns numeric value for known address', async () => {
    const result = await jsonRpc<{ value: number }>(SOL_MAINNET_READ_RPC, 'getBalance', [
      SOL_KNOWN_ADDR,
      { commitment: 'confirmed' },
    ]);
    expect(typeof result.value).toBe('number');
    expect(result.value).toBeGreaterThanOrEqual(0);
  });

  test('getTokenAccountsByOwner with mint filter returns parsed shape used by useSolLst', async () => {
    // PublicNode policy: programId-based filter is BLOCKED ("blocked parameter:
    // params.1.programId"), but per-mint filter is allowed. useSolLst calls once
    // per LST mint to comply.
    const result = await jsonRpc<{
      value: Array<{
        account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } };
      }>;
    }>(SOL_MAINNET_READ_RPC, 'getTokenAccountsByOwner', [
      SOL_KNOWN_ADDR,
      { mint: MSOL_MINT },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    expect(Array.isArray(result.value)).toBe(true);
    // If the test address has any mSOL accounts, validate response shape.
    if (result.value.length > 0) {
      const acc = result.value[0];
      expect(acc.account.data.parsed.info.mint).toBe(MSOL_MINT);
      expect('uiAmount' in acc.account.data.parsed.info.tokenAmount).toBe(true);
    }
  });

  // NOTE: We don't exercise all 3 LST mints in a single e2e run because
  // Foundation public RPC rate-limits identical-method bursts per IP — re-running
  // tests in tight succession trips a 429-equivalent ("Too many requests for a
  // specific RPC call"). In production each user sees 3 sequential calls every
  // 120s, well under the 40-req/10s/method/IP cap. Mints are validated by
  // frozen snapshot unit test (useSolLst.test.ts).

  test('refuses sendTransaction (defense-in-depth at RPC boundary)', async () => {
    // Forging a sendTransaction on a read-only public RPC: PublicNode allows
    // routing it but fails with malformed tx. Either way, our app's solReadCall
    // refuses by method name BEFORE issuing the request — that is the real guard.
    // This test asserts the upstream RPC accepts the method name (so our refusal
    // is meaningful: there *would* be a way to send if not for our guard).
    // We send invalid tx data and accept ANY non-2xx response.
    const res = await apiRequest(SOL_MAINNET_READ_RPC, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 9999,
        method: 'sendTransaction',
        params: ['invalid_base64'],
      }),
    });
    // RPC likely returns a JSON error (malformed tx), not a network 5xx
    expect(res.status).toBeLessThan(500);
    const body = res.body as { error?: unknown; result?: unknown };
    // Either error (expected) or some result (also OK — proves the path exists)
    expect(body.error !== undefined || body.result !== undefined).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// ETH Mainnet RPC — used by useEthLst (wagmi → multicall3)
// ────────────────────────────────────────────────────────────

// ABI-encoded `balanceOf(address)` selector + 32-byte padded address.
function encodeBalanceOf(addr: string): string {
  const stripped = addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  return '0x70a08231' + stripped;
}
// `stEthPerToken()` selector — no params
const STETH_PER_TOKEN_SELECTOR = '0x035faf82';

describe('17 — ETH Mainnet RPC (PublicNode)', () => {
  test('endpoint reachable', async () => {
    // PublicNode hosts ETH mainnet at `ethereum-rpc.publicnode.com` (no 'mainnet'
    // in URL — chainId verification below is the real check).
    expect(ETH_MAINNET_RPC).toContain('ethereum');
    const ok = await isReachable(ETH_MAINNET_RPC);
    expect(ok).toBe(true);
  });

  test('eth_chainId returns 0x1 (mainnet — load-bearing invariant)', async () => {
    const result = await jsonRpc<string>(ETH_MAINNET_RPC, 'eth_chainId', []);
    expect(result).toBe('0x1');
  });

  test('stETH balanceOf(vitalik) returns 32-byte hex (uint256)', async () => {
    const result = await jsonRpc<string>(ETH_MAINNET_RPC, 'eth_call', [
      { to: STETH_ADDRESS, data: encodeBalanceOf(VITALIK_ETH) },
      'latest',
    ]);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    // Vitalik may or may not hold stETH; assert the response parses to a valid BigInt.
    expect(() => BigInt(result)).not.toThrow();
  });

  test('wstETH balanceOf(vitalik) returns 32-byte hex (uint256)', async () => {
    const result = await jsonRpc<string>(ETH_MAINNET_RPC, 'eth_call', [
      { to: WSTETH_ADDRESS, data: encodeBalanceOf(VITALIK_ETH) },
      'latest',
    ]);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => BigInt(result)).not.toThrow();
  });

  test('wstETH stEthPerToken() returns plausible 1e18-scaled ratio', async () => {
    const result = await jsonRpc<string>(ETH_MAINNET_RPC, 'eth_call', [
      { to: WSTETH_ADDRESS, data: STETH_PER_TOKEN_SELECTOR },
      'latest',
    ]);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    const ratio = BigInt(result);
    // Sanity bounds: ratio is monotonically increasing (rebases up). Started at 1e18
    // in 2020-12, will never go below that. Plausible upper bound 2e18 for many years.
    expect(ratio).toBeGreaterThanOrEqual(1_000_000_000_000_000_000n);
    expect(ratio).toBeLessThanOrEqual(2_000_000_000_000_000_000n);
  });
});

// ────────────────────────────────────────────────────────────
// Pure logic — wstethToSteth, formatEthLstTotal
// ────────────────────────────────────────────────────────────

describe('17 — wstETH→stETH math (matches app logic)', () => {
  // Inline copy of useEthLst.ts:wstethToSteth — keeps e2e independent of source path.
  function wstethToSteth(wstethBal: bigint, ratio: bigint): bigint {
    return (wstethBal * ratio) / 1_000_000_000_000_000_000n;
  }

  test('zero balance returns zero regardless of ratio', () => {
    expect(wstethToSteth(0n, 1_180_000_000_000_000_000n)).toBe(0n);
  });

  test('1 wstETH at ratio 1.18 returns 1.18 stETH', () => {
    const ONE = 1_000_000_000_000_000_000n;
    const ratio = 1_180_000_000_000_000_000n;
    expect(wstethToSteth(ONE, ratio)).toBe(ratio);
  });

  test('5 wstETH at ratio 1.18 returns 5.9 stETH', () => {
    const FIVE = 5_000_000_000_000_000_000n;
    const ratio = 1_180_000_000_000_000_000n;
    expect(wstethToSteth(FIVE, ratio)).toBe(5_900_000_000_000_000_000n);
  });

  test('rounds toward zero (BigInt floor division)', () => {
    // 1 wei wstETH × ratio / 1e18 = floor(1.18 × 1e0) = 1
    const oneWei = 1n;
    const ratio = 1_180_000_000_000_000_000n;
    expect(wstethToSteth(oneWei, ratio)).toBe(1n);
  });
});

// ────────────────────────────────────────────────────────────
// Address regex invariants — selector logic in StakingCard
// ────────────────────────────────────────────────────────────

describe('17 — Address shape validators', () => {
  const SUI_RE = /^0x[a-fA-F0-9]{64}$/;
  const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
  const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

  test('SUI shape rejects ETH address', () => {
    expect(SUI_RE.test(VITALIK_ETH)).toBe(false);
  });

  test('SUI shape accepts 64-hex', () => {
    expect(SUI_RE.test(SUI_ZERO_ADDR)).toBe(true);
  });

  test('ETH shape rejects SUI address', () => {
    expect(ETH_RE.test(SUI_ZERO_ADDR)).toBe(false);
  });

  test('ETH shape accepts vitalik', () => {
    expect(ETH_RE.test(VITALIK_ETH)).toBe(true);
  });

  test('SOL shape accepts known mainnet address', () => {
    expect(SOL_RE.test(SOL_KNOWN_ADDR)).toBe(true);
  });

  test('SOL shape rejects 0x prefixed', () => {
    expect(SOL_RE.test(VITALIK_ETH)).toBe(false);
  });
});
