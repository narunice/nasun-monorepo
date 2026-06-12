// C3a login handlers: sui + metamask prepare/connect-verify. Ported from auth-sui and auth-metamask
// (prepare.ts + connect-verify.ts) to preserve byte-exact request/response parity. Differences from the
// lambda (intentional, per the C3a (B) decision):
//   - nonce: in-memory (nonce-store) instead of DynamoDB.
//   - identity mint: issuer loopback (clients.mintIdentity) instead of Cognito SDK (the lambdas already
//     mint via the issuer in prod; this is the same call).
//   - profile write: box loopback /profile/upsert ONLY (clients.upsertProfile); NO DynamoDB write.
// 4xx client errors throw RouteAbort so the server maps them; 5xx surface as throws -> generic 500.

import { randomBytes } from 'node:crypto';
import { verifySuiPersonalSignature, verifyZkLoginEphemeralSignature, verifyEvmSignature } from './crypto';
import { putNonce, consumeNonce } from './nonce-store';
import { mintIdentity, upsertProfile, walletProof } from './clients';
import { RouteAbort } from './http';

const NONCE_TTL_SECONDS = 300;
const SUI_ADDR_RE = /^0x[a-f0-9]{64}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

interface Result {
  status: number;
  body: Record<string, unknown>;
}

// --- Sui ----------------------------------------------------------------------------------------

export function handleSuiPrepare(): Result {
  const nonce = randomBytes(32).toString('hex');
  const message =
    `Nasun Wallet Verification (Sui)\n\n` +
    `✅ NO funds will be transferred\n` +
    `✅ NO transaction will be executed\n` +
    `✅ This only verifies wallet ownership\n` +
    `✅ This is a SIGNATURE request only\n\n` +
    `Nonce: ${nonce}`;
  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;
  putNonce(`suiPrepare:${nonce}`, { message, expiresAt });
  return { status: 200, body: { nonce, message } };
}

export async function handleSuiConnectVerify(body: any): Promise<Result> {
  const { signature, nonce, zkAddress, ephemeralPublicKey } = body ?? {};
  const isZkLogin = !!(zkAddress && ephemeralPublicKey);

  if (!signature || !nonce) throw new RouteAbort(400, { message: 'signature and nonce are required' });
  if (isZkLogin && !SUI_ADDR_RE.test(zkAddress)) throw new RouteAbort(400, { message: 'Invalid zkAddress format' });

  const record = consumeNonce(`suiPrepare:${nonce}`);
  if (!record) throw new RouteAbort(400, { message: 'Nonce not found or expired (may have been used already)' });
  if (Date.now() / 1000 > record.expiresAt) throw new RouteAbort(400, { message: 'Nonce expired' });

  const messageBytes = new TextEncoder().encode(record.message);
  let walletAddress: string;

  if (isZkLogin) {
    try {
      const ok = await verifyZkLoginEphemeralSignature(messageBytes, signature, ephemeralPublicKey);
      if (!ok) throw new Error('Ephemeral key mismatch');
    } catch {
      throw new RouteAbort(401, { message: 'Invalid zkLogin ephemeral signature' });
    }
    walletAddress = zkAddress; // format validated above
  } else {
    try {
      walletAddress = await verifySuiPersonalSignature(messageBytes, signature);
    } catch {
      throw new RouteAbort(401, { message: 'Invalid signature' });
    }
    if (!SUI_ADDR_RE.test(walletAddress)) throw new RouteAbort(401, { message: 'Invalid recovered Sui address' });
  }

  return await finishLogin(walletAddress, `nasun_${walletAddress.toLowerCase()}`, 'sui', 'Nasun Wallet');
}

// --- MetaMask -----------------------------------------------------------------------------------

export function handleEvmPrepare(body: any, acceptLanguage: string): Result {
  const nonce = randomBytes(32).toString('hex');
  const lang = body?.lang;
  const isKorean = lang
    ? String(lang).toLowerCase().startsWith('ko')
    : (acceptLanguage || '').toLowerCase().startsWith('ko');
  const message = isKorean
    ? `Nasun 지갑 인증\n\n` +
      `✅ 자금이 이체되지 않습니다\n` +
      `✅ 트랜잭션이 실행되지 않습니다\n` +
      `✅ 지갑 소유권만 확인합니다\n` +
      `✅ 서명 요청일 뿐입니다\n\n` +
      `Nonce: ${nonce}`
    : `Nasun Wallet Verification\n\n` +
      `✅ NO funds will be transferred\n` +
      `✅ NO transaction will be executed\n` +
      `✅ This only verifies wallet ownership\n` +
      `✅ This is a SIGNATURE request only\n\n` +
      `Nonce: ${nonce}`;
  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;
  putNonce(`prepare:${nonce}`, { message, expiresAt });
  return { status: 200, body: { nonce, message } };
}

export async function handleEvmConnectVerify(body: any): Promise<Result> {
  const { signature, nonce } = body ?? {};
  if (!signature || !nonce) throw new RouteAbort(400, { message: 'signature and nonce are required' });

  const record = consumeNonce(`prepare:${nonce}`);
  if (!record) throw new RouteAbort(400, { message: 'Nonce not found or expired (may have been used already)' });
  if (Date.now() / 1000 > record.expiresAt) throw new RouteAbort(400, { message: 'Nonce expired' });
  if (!record.message) throw new RouteAbort(400, { message: 'Invalid signature' });

  let walletAddress: string;
  try {
    walletAddress = await verifyEvmSignature(record.message, signature);
  } catch {
    throw new RouteAbort(401, { message: 'Invalid signature' });
  }
  walletAddress = walletAddress.toLowerCase();
  if (!EVM_ADDR_RE.test(walletAddress)) throw new RouteAbort(401, { message: 'Invalid recovered address' });

  return await finishLogin(walletAddress, `metamask_${walletAddress.toLowerCase()}`, 'metamask', 'MetaMask');
}

// --- shared tail: mint identity -> upsert profile (box-only) -> wallet proof ---------------------

async function finishLogin(
  walletAddress: string,
  developerUserIdentifier: string,
  provider: string,
  profileProvider: string,
): Promise<Result> {
  // 1. Mint identity via the issuer (loopback). Throws -> 500 (auth-failed parity).
  const { identityId, token } = await mintIdentity(developerUserIdentifier, provider);

  // 2. Upsert the profile to box PG (loopback /profile/upsert). Throws -> 500 (do not silently diverge
  //    the SoT). NO DynamoDB write (the (B) divergence; box end-state == the lambda path).
  await upsertProfile(identityId, walletAddress, profileProvider);

  // 3. HMAC wallet proof.
  const proofIssuedAt = new Date().toISOString();
  const proof = walletProof(walletAddress, proofIssuedAt);

  return { status: 200, body: { walletAddress, identityId, token, walletProof: proof, proofIssuedAt } };
}
