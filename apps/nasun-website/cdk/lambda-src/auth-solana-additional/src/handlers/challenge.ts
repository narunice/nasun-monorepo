import { randomBytes } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toSolAddress, addrEq } from '../utils/solana';
import {
  getProfile,
  getSolanaLink,
  isAppIdValid,
  findOtherOwnerOfAddress,
  MAX_ADDITIONAL_ADDRESSES,
} from '../utils/userProfile';
import { putAdditionalSolNonce, NONCE_TTL_SECONDS } from '../utils/nonceStore';
import { badRequest, conflict, json, methodNotAllowed } from '../utils/responses';

export async function handleChallenge(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'POST') return methodNotAllowed(headers);

  const body = JSON.parse(event.body || '{}');
  const walletAddress = toSolAddress(body.walletAddress);
  const rawAppId: string | undefined = typeof body.appId === 'string' ? body.appId.toLowerCase() : undefined;

  if (!walletAddress) return badRequest('walletAddress must be a valid Solana address', headers);
  if (rawAppId !== undefined && !isAppIdValid(rawAppId)) {
    return badRequest('appId must match /^[a-z][a-z0-9-]{0,31}$/', headers);
  }

  const profile = await getProfile(identityId);
  const sol = getSolanaLink(profile);

  // Unlike EVM, the first verified Solana link IS the primary — no
  // precondition that a primary already exist. The duplicate guards below
  // still fire if the user is re-verifying an address they already own.
  if (sol && sol.manualEntry !== true && sol.walletAddress) {
    if (addrEq(sol.walletAddress, walletAddress)) {
      return badRequest('address already verified', headers);
    }
    for (const entry of sol.additionalAddresses ?? []) {
      if (addrEq(entry?.walletAddress, walletAddress)) {
        return badRequest('address already verified', headers);
      }
    }
    const existingCount = sol.additionalAddresses?.length ?? 0;
    if (existingCount >= MAX_ADDITIONAL_ADDRESSES) {
      return badRequest(`address cap reached (max ${MAX_ADDITIONAL_ADDRESSES})`, headers);
    }
  }

  // Cross-account uniqueness: 1 Solana address can only be bound to 1
  // Nasun account. The owning identityId is intentionally NOT echoed in
  // the response — same threat model as EVM (probing).
  const otherOwner = await findOtherOwnerOfAddress(walletAddress, identityId);
  if (otherOwner) {
    console.warn(
      `[challenge] address_already_owned addr=${walletAddress} owner=${otherOwner} caller=${identityId}`,
    );
    return conflict(
      'This address is verified on another Nasun account.',
      { code: 'ADDRESS_ALREADY_OWNED' },
      headers
    );
  }

  // Nonce + UTF-8 message. Embed appId so a signature for purpose=drift
  // cannot be replayed to bind the address to purpose=jupiter.
  const nonce = randomBytes(32).toString('hex');
  const purpose = rawAppId || 'generic';
  const message =
    `Add Solana wallet to Nasun.\n\n` +
    `Address: ${walletAddress}\n` +
    `Purpose: ${purpose}\n` +
    `Nonce: ${nonce}`;
  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;

  await putAdditionalSolNonce(nonce, {
    identityId,
    walletAddress,
    appId: rawAppId,
    message,
    expiresAt,
  });

  return json(200, { nonce, message, expiresAt }, headers);
}
