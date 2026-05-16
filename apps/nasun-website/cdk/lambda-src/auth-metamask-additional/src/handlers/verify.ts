import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifySignature, toChecksum, addrEq } from '../utils/ethereum';
import {
  getProfile,
  getMetaMaskLink,
  appendAdditionalAddress,
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

  const body = JSON.parse(event.body || '{}');
  const { signature, nonce } = body as { signature?: string; nonce?: string };
  if (!signature || !nonce) {
    return badRequest('signature and nonce are required', headers);
  }

  // 1) Atomic get+delete. Reusable nonces would be a forgery vector.
  const record = await consumeAdditionalNonce('additional:', nonce);
  if (!record) {
    return badRequest('Nonce not found or already used', headers);
  }

  if (Math.floor(Date.now() / 1000) > record.expiresAt) {
    return badRequest('Nonce expired', headers);
  }

  // 2) The challenge step bound the nonce to a specific identityId.
  // A different caller cannot consume someone else's nonce.
  if (record.identityId !== identityId) {
    console.warn(
      `[verify] identity mismatch -- nonce.identityId=${record.identityId} caller=${identityId}`,
    );
    return badRequest('Nonce identity mismatch', headers);
  }

  // 3) Recover address from the exact message we stored at challenge time.
  // Using the stored message avoids the ethers `verifyMessage` ambiguity
  // bug (returns garbage address instead of throwing on mismatch) — same
  // pattern as auth-metamask/connect-verify.ts L66-L70.
  let recovered: string;
  try {
    recovered = await verifySignature(record.message, signature);
  } catch {
    return badRequest('Invalid signature', headers);
  }

  if (!recovered || !addrEq(recovered, record.walletAddress)) {
    // The signer's recovered address must match the wallet the user
    // asked to add. Otherwise they could sign with wallet A and submit
    // wallet B's address.
    return badRequest('Signature does not match challenged address', headers);
  }

  const checksum = toChecksum(record.walletAddress);
  if (!checksum) {
    // Shouldn't happen — challenge step already normalized.
    return badRequest('Invalid stored address', headers);
  }

  // 4) Re-run the safety checks. Between challenge issue and verify, the
  // user might have raced another flow (e.g. removed primary, hit cap).
  const profile = await getProfile(identityId);
  const meta = getMetaMaskLink(profile);
  if (!meta || !meta.walletAddress || meta.manualEntry === true) {
    return badRequest('primary metamask required', headers);
  }
  if (addrEq(meta.walletAddress, checksum)) {
    return badRequest('address already verified', headers);
  }
  if ((meta.additionalAddresses ?? []).some((e) => addrEq(e?.walletAddress, checksum))) {
    return badRequest('address already verified', headers);
  }
  if ((meta.additionalAddresses?.length ?? 0) >= MAX_ADDITIONAL_ADDRESSES) {
    return badRequest(`address cap reached (max ${MAX_ADDITIONAL_ADDRESSES})`, headers);
  }
  const otherOwner = await findOtherOwnerOfAddress(checksum, identityId);
  if (otherOwner) {
    console.warn(
      `[verify] address_already_owned addr=${checksum} owner=${otherOwner} caller=${identityId}`,
    );
    return conflict(
      'This address is verified on another Nasun account.',
      { code: 'ADDRESS_ALREADY_OWNED' },
      headers
    );
  }

  const verifiedAt = Date.now();
  try {
    await appendAdditionalAddress(identityId, { walletAddress: checksum, verifiedAt }, record.appId);
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const msg = (err as Error).message || 'Failed to persist verified address';
    // ConditionalCheckFailedException from the conditional UpdateExpression
    // surfaces as a generic error name. Treat as race-condition retry.
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return conflict('Concurrent update detected. Please retry.', { code: 'RACE' }, headers);
    }
    return json(status && status >= 400 && status < 500 ? status : 500, { message: msg }, headers);
  }

  const appBinding = record.appId
    ? { appId: record.appId, walletAddress: checksum }
    : undefined;

  return json(200, { walletAddress: checksum, verifiedAt, appBinding }, headers);
}
