// Solana constants for uju dashboard.
//
// TESTNET-ONLY INVARIANT: Nasun is a devnet project and uju is a prototype.
// SOL_DEVNET_RPC MUST NOT be replaced with mainnet-beta endpoint under any
// circumstance. This constant is hardcoded (not env-driven) to prevent a
// .env edit from flipping the app to mainnet. A vitest guard enforces this.
// Phase 9 signing work must construct transactions against this endpoint
// only — no mainnet tx signing from uju, ever.
export const SOL_DEVNET_RPC = 'https://api.devnet.solana.com';

export const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export function isValidSolAddress(addr: string): boolean {
  return SOL_ADDRESS_RE.test(addr);
}
