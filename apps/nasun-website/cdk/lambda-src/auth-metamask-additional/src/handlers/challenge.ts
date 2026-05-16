import { randomBytes } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toChecksum, addrEq } from '../utils/ethereum';
import {
  getProfile,
  getMetaMaskLink,
  isAppIdValid,
  findOtherOwnerOfAddress,
  MAX_ADDITIONAL_ADDRESSES,
} from '../utils/userProfile';
import { putAdditionalNonce, NONCE_TTL_SECONDS } from '../../../_shared/additional-link/nonceStore';
import { badRequest, conflict, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

export async function handleChallenge(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'POST') return methodNotAllowed(headers);

  const body = JSON.parse(event.body || '{}');
  const walletAddress = toChecksum(body.walletAddress);
  const rawAppId: string | undefined = typeof body.appId === 'string' ? body.appId.toLowerCase() : undefined;

  if (!walletAddress) return badRequest('walletAddress must be a valid EVM address', headers);
  if (rawAppId !== undefined && !isAppIdValid(rawAppId)) {
    return badRequest('appId must match /^[a-z][a-z0-9-]{0,31}$/', headers);
  }

  const profile = await getProfile(identityId);
  const meta = getMetaMaskLink(profile);
  if (!meta || !meta.walletAddress || meta.manualEntry === true) {
    return badRequest('primary metamask required', headers);
  }

  // Duplicate guard: address must not already be primary or in additional set.
  if (addrEq(meta.walletAddress, walletAddress)) {
    return badRequest('address already verified', headers);
  }
  for (const entry of meta.additionalAddresses ?? []) {
    if (addrEq(entry?.walletAddress, walletAddress)) {
      return badRequest('address already verified', headers);
    }
  }

  // Cap check (server-side hard limit).
  const existingCount = meta.additionalAddresses?.length ?? 0;
  if (existingCount >= MAX_ADDITIONAL_ADDRESSES) {
    return badRequest(`address cap reached (max ${MAX_ADDITIONAL_ADDRESSES})`, headers);
  }

  // Cross-account uniqueness: 1 EVM address can only be bound to 1 Nasun account.
  // The owning identityId is intentionally NOT echoed in the response — any
  // authenticated user could otherwise probe arbitrary addresses to map them
  // back to internal Nasun account identifiers. Server-side log it only.
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

  // Generate nonce and message. The message embeds the appId (when present)
  // so a signature for `purpose=uniswap` cannot be replayed to bind the
  // address to `purpose=hyperliquid`.
  const nonce = randomBytes(32).toString('hex');
  const purpose = rawAppId || 'generic';
  const message =
    `Add additional wallet to Nasun.\n\n` +
    `Address: ${walletAddress}\n` +
    `Purpose: ${purpose}\n` +
    `Nonce: ${nonce}`;
  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;

  await putAdditionalNonce('additional:', nonce, {
    identityId,
    walletAddress,
    appId: rawAppId,
    message,
    expiresAt,
  });

  return json(200, { nonce, message, expiresAt }, headers);
}
