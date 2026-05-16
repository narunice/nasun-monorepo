import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifySolSignature, toSolAddress, addrEq } from '../utils/solana';
import {
  getProfile,
  getSolanaLink,
  appendVerifiedAddress,
  findOtherOwnerOfAddress,
  MAX_ADDITIONAL_ADDRESSES,
} from '../utils/userProfile';
import { consumeAdditionalNonce } from '../../../_shared/additional-link/nonceStore';
import { badRequest, conflict, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

export async function handleVerify(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'POST') return methodNotAllowed(headers);

  let body: { signature?: string; nonce?: string; publicKey?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return badRequest('Invalid JSON body', headers);
  }
  const { signature, nonce, publicKey } = body;
  if (!signature || !nonce || !publicKey) {
    return badRequest('signature, nonce, and publicKey are required', headers);
  }

  // 1) Atomic get+delete. Reusable nonces would be a forgery vector.
  const record = await consumeAdditionalNonce('solana_additional:', nonce);
  if (!record) {
    return badRequest('Nonce not found or already used', headers);
  }

  if (Math.floor(Date.now() / 1000) > record.expiresAt) {
    return badRequest('Nonce expired', headers);
  }

  // 2) Nonce-to-identity binding: the caller must match the challenger.
  if (record.identityId !== identityId) {
    console.warn(
      `[verify] identity mismatch -- nonce.identityId=${record.identityId} caller=${identityId}`,
    );
    return badRequest('Nonce identity mismatch', headers);
  }

  // 3) Verify the Ed25519 signature against the EXACT message we stored at
  // challenge time. Critical: never use a client-supplied message. The
  // publicKey must equal the address we challenged (verifySolSignature
  // re-asserts publicKey===expectedPubkey internally, but we surface a
  // clearer 400 here too).
  const canonicalAddr = toSolAddress(record.walletAddress);
  if (!canonicalAddr) {
    return badRequest('Invalid stored address', headers);
  }
  if (publicKey !== canonicalAddr) {
    return badRequest('publicKey does not match challenged address', headers);
  }
  const ok = verifySolSignature(record.message, signature, publicKey);
  if (!ok) {
    return badRequest('Invalid signature', headers);
  }

  // 4) Re-run race-sensitive checks. Profile state may have shifted
  // between challenge and verify.
  const profile = await getProfile(identityId);
  const sol = getSolanaLink(profile);

  if (sol && sol.manualEntry !== true && sol.walletAddress) {
    if (addrEq(sol.walletAddress, canonicalAddr)) {
      return badRequest('address already verified', headers);
    }
    if ((sol.additionalAddresses ?? []).some((e) => addrEq(e?.walletAddress, canonicalAddr))) {
      return badRequest('address already verified', headers);
    }
    if ((sol.additionalAddresses?.length ?? 0) >= MAX_ADDITIONAL_ADDRESSES) {
      return badRequest(`address cap reached (max ${MAX_ADDITIONAL_ADDRESSES})`, headers);
    }
  }

  const otherOwner = await findOtherOwnerOfAddress(canonicalAddr, identityId);
  if (otherOwner) {
    console.warn(
      `[verify] address_already_owned addr=${canonicalAddr} owner=${otherOwner} caller=${identityId}`,
    );
    return conflict(
      'This address is verified on another Nasun account.',
      { code: 'ADDRESS_ALREADY_OWNED' },
      headers
    );
  }

  const verifiedAt = Date.now();
  let result: Awaited<ReturnType<typeof appendVerifiedAddress>>;
  try {
    result = await appendVerifiedAddress(
      identityId,
      { walletAddress: canonicalAddr, verifiedAt },
      record.appId,
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const msg = (err as Error).message || 'Failed to persist verified address';
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return conflict('Concurrent update detected. Please retry.', { code: 'RACE' }, headers);
    }
    return json(status && status >= 400 && status < 500 ? status : 500, { message: msg }, headers);
  }

  const appBinding = record.appId
    ? { appId: record.appId, walletAddress: canonicalAddr }
    : undefined;

  return json(200, {
    walletAddress: canonicalAddr,
    verifiedAt,
    primary: result.primary,
    appBinding,
  }, headers);
}
