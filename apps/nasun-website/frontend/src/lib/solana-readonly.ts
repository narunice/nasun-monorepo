// READ-ONLY INVARIANT: This module exposes a Solana mainnet RPC for QUERY ONLY.
// Allowed JSON-RPC methods: getBalance, getTokenAccountsByOwner, etc.
// Forbidden: sendTransaction / signTransaction / simulateTransaction.
//
// Enforced by:
//  1. Naming convention — `_READ_RPC` infix is load-bearing; reviewers must
//     reject any PR that pairs SOL_MAINNET_READ_RPC with tx-sending calls.
//  2. Vitest host-match assertion (see __tests__/solana-readonly.test.ts).
//  3. Code review.
//
// Tx signing must use SOL_DEVNET_RPC from solana.ts (testnet-only invariant).
//
// RPC choice (e2e measurement, 2026-04):
//   - PublicNode (https://solana-rpc.publicnode.com): getBalance fast, but
//     `getTokenAccountsByOwner` (with mint filter) hangs / 15s+ timeout.
//   - Solana Foundation public (https://api.mainnet-beta.solana.com): both
//     methods respond <300ms. $0, no API key, 100 req/s shared rate limit.
//     Acceptable for prototype self-display use case.
//   - Helius free tier rejected: VITE_* keys leak via frontend bundle (quota
//     theft risk + CLAUDE.md "Secrets Manager" policy).
// If Foundation public RPC degrades, swap to a backend Lambda proxy.

export const SOL_MAINNET_READ_RPC = "https://api.mainnet-beta.solana.com";

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let _id = 0;

/**
 * Minimal JSON-RPC fetch wrapper for read-only Solana mainnet calls.
 * Throws on RPC error or non-OK HTTP. Caller handles retries via react-query.
 */
export async function solReadCall<T = unknown>(
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<T> {
  // Defense-in-depth: refuse to issue any method that smells like signing.
  // Read methods on Solana are getBalance / getAccountInfo / getProgramAccounts /
  // getTokenAccountsByOwner / getParsedTokenAccountsByOwner / etc.
  if (
    method === "sendTransaction" ||
    method === "simulateTransaction" ||
    method === "requestAirdrop"
  ) {
    throw new Error(`solReadCall: ${method} is forbidden on read-only RPC`);
  }

  _id += 1;
  const res = await fetch(SOL_MAINNET_READ_RPC, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: _id, method, params }),
  });
  if (!res.ok) {
    throw new Error(`SOL RPC HTTP ${res.status}`);
  }
  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(`SOL RPC error: ${json.error.message}`);
  }
  if (json.result === undefined) {
    throw new Error("SOL RPC: empty result");
  }
  return json.result;
}
