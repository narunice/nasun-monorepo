import { randomBytes } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toSuiAddress, addrEq } from '../utils/sui';
import {
  getProfile,
  getSuiLink,
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

  let body: { walletAddress?: unknown; appId?: unknown };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return badRequest('Invalid JSON body', headers);
  }
  const walletAddress = toSuiAddress(body.walletAddress as string | undefined);
  const rawAppId: string | undefined = typeof body.appId === 'string' ? body.appId.toLowerCase() : undefined;

  if (!walletAddress) return badRequest('walletAddress must be a valid Sui address', headers);
  if (rawAppId !== undefined && !isAppIdValid(rawAppId)) {
    return badRequest('appId must match /^[a-z][a-z0-9-]{0,31}$/', headers);
  }

  const profile = await getProfile(identityId);
  const sui = getSuiLink(profile);

  // First verify becomes primary; subsequent verifies append. The legacy
  // paste link at root linkedSuiAddress is intentionally NOT considered a
  // primary -- it was never proven, so a re-verify is allowed and will
  // overwrite the slot via the manualEntry=true branch in appendVerifiedAddress.
  if (sui && sui.manualEntry !== true && sui.walletAddress) {
    if (addrEq(sui.walletAddress, walletAddress)) {
      return badRequest('address already verified', headers);
    }
    for (const entry of sui.additionalAddresses ?? []) {
      if (addrEq(entry?.walletAddress, walletAddress)) {
        return badRequest('address already verified', headers);
      }
    }
    const existingCount = sui.additionalAddresses?.length ?? 0;
    if (existingCount >= MAX_ADDITIONAL_ADDRESSES) {
      return badRequest(`address cap reached (max ${MAX_ADDITIONAL_ADDRESSES})`, headers);
    }
  }

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

  const nonce = randomBytes(32).toString('hex');
  const purpose = rawAppId || 'generic';
  const message =
    `Add Sui wallet to Nasun.\n\n` +
    `Address: ${walletAddress}\n` +
    `Purpose: ${purpose}\n` +
    `Nonce: ${nonce}`;
  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;

  await putAdditionalNonce('sui_additional:', nonce, {
    identityId,
    walletAddress,
    appId: rawAppId,
    message,
    expiresAt,
  });

  return json(200, { nonce, message, expiresAt }, headers);
}
