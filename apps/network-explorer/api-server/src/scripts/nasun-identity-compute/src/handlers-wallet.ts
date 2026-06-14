// C3b wallet register/remove/list handlers -- de-Lambda of the wallet-api lambda's multi-wallet routes.
// Each runs AFTER the server has verified the incoming JWT (identityId is trusted here). 4xx client errors
// throw RouteAbort (byte-parity with the lambda bodies); the box loopback returns the box { status, body }
// for 2xx + 4xx (proxied through byte-identically -- the box 400/403/404/409/429 bodies match the lambda's)
// and throws on a box 5xx / transport error (-> the server maps it to a generic 500).
//
// Order is preserved from the lambda exactly so a malformed request lands the SAME status:
//   register: 400 required (index.ts handleRegister) -> 400 bad format (registerWallet) -> 403 proof
//             (registerWallet) -> box { 200 | 429 | 409 }.
//   remove:   400 required (index.ts handleRemove) -> box { 200 | 400 last-wallet | 403 | 404 }.
//   list:     box 200 { wallets }.
// The box (:3211) is authoritative + already holds the complete mirror (the flipped lambda writes/reads it
// today). Box-only write, NO DynamoDB (the (B) divergence, covered by the reconcile post-cutover exclusion).

import { RouteAbort } from './http';
import {
  verifyWalletProofHmac,
  walletRegisterBox,
  walletRemoveBox,
  walletListBox,
  notifyWalletRegistered,
} from './clients';

// Same validation regex as the lambda registerWallet.ts:8 + the box :3211 (address lower-cased first).
const SUI_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;

interface Result {
  status: number;
  body: Record<string, unknown>;
}

export async function handleWalletRegister(identityId: string, body: any): Promise<Result> {
  // Required fields (parity index.ts handleRegister: 400 before any address/proof work).
  if (!body?.walletAddress || !body?.walletProof || !body?.proofIssuedAt) {
    throw new RouteAbort(400, { error: 'walletAddress, walletProof, and proofIssuedAt are required' });
  }
  // Address format -- lower-case THEN 0x+64hex, BEFORE the proof check (registerWallet.ts:30-35 order, so a
  // bad-format address with a bad proof lands 400 not 403, matching the lambda).
  const addr = String(body.walletAddress).toLowerCase();
  if (!SUI_ADDRESS_REGEX.test(addr)) {
    throw new RouteAbort(400, { error: 'Invalid Sui wallet address format' });
  }
  // Wallet-proof HMAC over the LOWER-CASED address (registerWallet.ts:30,38) -> 403 with the lambda reason.
  // proofIssuedAt is passed RAW (not String()-coerced) so a numeric value lands new Date(value) exactly as
  // the lambda verifyWalletProof does (walletProof.ts:48), not a String()->'Invalid Date' divergence.
  const proof = verifyWalletProofHmac(addr, body.walletProof, body.proofIssuedAt);
  if (!proof.valid) {
    throw new RouteAbort(403, { error: 'Wallet proof verification failed', reason: proof.reason });
  }
  // Authoritative box write (MAX-10 / transfer / idempotent-already-mine all live inside the box tx). The
  // box { status, body } is proxied through (200 { walletAddress, blockchain, registeredAt, transferred? }
  // or 429/409). registeredAt is the box-generated timestamp (no DynamoDB to source it from post-cutover).
  const out = await walletRegisterBox(identityId, addr);
  // Best-effort points-scanner cache invalidation (fire-and-forget; never throws; inert until wired).
  if (out.status === 200) void notifyWalletRegistered(identityId, addr);
  return out;
}

export async function handleWalletRemove(identityId: string, body: any): Promise<Result> {
  // Required field (parity index.ts handleRemove). No wallet-proof (the lambda removeWallet does not verify
  // one either -- ownership is enforced by the box sentinel-CAS delete, which 403s a non-owner).
  if (!body?.walletAddress) {
    throw new RouteAbort(400, { error: 'walletAddress is required' });
  }
  const addr = String(body.walletAddress).toLowerCase();
  // Box { 200 | 400 last-wallet | 403 not-owner | 404 not-found } proxied through (bodies match the lambda).
  return await walletRemoveBox(identityId, addr);
}

export async function handleWalletList(identityId: string): Promise<Result> {
  // Box GET /wallet/list?identityId= -> 200 { wallets } (ORDER BY wallet_address ASC == DDB sort order).
  return await walletListBox(identityId);
}
