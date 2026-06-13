// C4-1 additional-wallet handlers, chain-generic (sui ships first; solana/metamask reuse via CHAINS).
// Ported from auth-{sui,...}-additional handlers (challenge/verify/label/remove/app-binding). Each is
// already past JWT verification (the router resolves identityId via identity-verify), so identityId is
// trusted here. 4xx client errors throw RouteAbort {message[, code]} (parity with the lambda's
// badRequest/conflict bodies). LinkError from the link layer is bridged to RouteAbort.

import { randomBytes } from 'node:crypto';
import { RouteAbort } from './http';
import type { AdditionalChain } from './additional-chains';
import {
  putAdditionalNonce,
  consumeAdditionalNonce,
  NONCE_TTL_SECONDS,
} from './additional-nonce-store';
import { readProfileByIdentity, readAddressOwner } from './clients';
import {
  getLink,
  collectVerifiedAddresses,
  appendVerified,
  setLabel,
  removeAdditional,
  setAppBinding,
  removeAppBinding,
  isAppIdValid,
  sanitizeLabel,
  LinkError,
  MAX_ADDITIONAL_ADDRESSES,
  MAX_LABEL_LENGTH,
} from './link-additional';

interface Result {
  status: number;
  body: Record<string, unknown>;
}

// Translate a LinkError (from the CAS write / link validation) into the RouteAbort the server maps.
function bridge(err: unknown): never {
  if (err instanceof LinkError) {
    throw new RouteAbort(err.statusCode, { message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  throw err;
}

// Shared pre-link guards (already-verified / cap), run on a freshly read sub. Mirror of the lambda
// challenge/verify re-checks. Only applies when a verified primary exists.
function assertNotAlreadyLinked(chain: AdditionalChain, sub: ReturnType<typeof getLink>, addr: string): void {
  if (sub && sub.manualEntry !== true && sub.walletAddress) {
    if (chain.addrEq(sub.walletAddress, addr)) throw new RouteAbort(400, { message: 'address already verified' });
    if ((sub.additionalAddresses ?? []).some((e) => chain.addrEq(e?.walletAddress, addr))) {
      throw new RouteAbort(400, { message: 'address already verified' });
    }
    if ((sub.additionalAddresses?.length ?? 0) >= MAX_ADDITIONAL_ADDRESSES) {
      throw new RouteAbort(400, { message: `address cap reached (max ${MAX_ADDITIONAL_ADDRESSES})` });
    }
  }
}

// Fail-closed cross-account uniqueness: a box error THROWS (readAddressOwner throws on non-200), which
// the server maps to 500 -- never a silent "no collision" (that would be an anti-Sybil hole).
async function assertUnique(chain: AdditionalChain, addr: string, self: string): Promise<void> {
  const owner = await readAddressOwner(chain.ownerChainParam, addr, self);
  if (owner) {
    throw new RouteAbort(409, { message: 'This address is verified on another Nasun account.', code: 'ADDRESS_ALREADY_OWNED' });
  }
}

export async function handleChallenge(chain: AdditionalChain, identityId: string, body: any): Promise<Result> {
  const walletAddress = chain.toAddress(body?.walletAddress);
  const rawAppId: string | undefined = typeof body?.appId === 'string' ? body.appId.toLowerCase() : undefined;
  if (!walletAddress) throw new RouteAbort(400, { message: `walletAddress must be a valid ${chain.provider} address` });
  if (rawAppId !== undefined && !isAppIdValid(rawAppId)) {
    throw new RouteAbort(400, { message: 'appId must match /^[a-z][a-z0-9-]{0,31}$/' });
  }

  const profile = await readProfileByIdentity(identityId);
  const sub = getLink(profile, chain);
  assertNotAlreadyLinked(chain, sub, walletAddress);
  await assertUnique(chain, walletAddress, identityId);

  const nonce = randomBytes(32).toString('hex');
  const purpose = rawAppId || 'generic';
  const message = chain.buildMessage(walletAddress, nonce, purpose);
  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;
  putAdditionalNonce(`${chain.noncePrefix}${nonce}`, { provider: chain.provider, identityId, walletAddress, appId: rawAppId, message, expiresAt });

  return { status: 200, body: { nonce, message, expiresAt } };
}

export async function handleVerify(chain: AdditionalChain, identityId: string, body: any): Promise<Result> {
  const signature = body?.signature;
  const nonce = body?.nonce;
  if (!signature || !nonce) throw new RouteAbort(400, { message: 'signature and nonce are required' });

  const record = consumeAdditionalNonce(`${chain.noncePrefix}${nonce}`);
  if (!record) throw new RouteAbort(400, { message: 'Nonce not found or already used' });
  if (record.provider !== chain.provider) throw new RouteAbort(400, { message: 'Nonce chain mismatch' });
  if (Math.floor(Date.now() / 1000) > record.expiresAt) throw new RouteAbort(400, { message: 'Nonce expired' });
  if (record.identityId !== identityId) throw new RouteAbort(400, { message: 'Nonce identity mismatch' });

  const canonicalAddr = chain.toAddress(record.walletAddress);
  if (!canonicalAddr) throw new RouteAbort(400, { message: 'Invalid stored address' });

  // Verify the signature against the EXACT stored message + challenged address (never client input).
  const recovered = await chain.verify(record.message, signature, canonicalAddr);
  if (!recovered) throw new RouteAbort(400, { message: 'Invalid signature' });

  // Re-run race-sensitive checks on a fresh read (profile may have shifted between challenge and verify).
  const profile = await readProfileByIdentity(identityId);
  const sub = getLink(profile, chain);
  assertNotAlreadyLinked(chain, sub, canonicalAddr);
  await assertUnique(chain, canonicalAddr, identityId);

  const verifiedAt = Date.now();
  let result: Awaited<ReturnType<typeof appendVerified>>;
  try {
    result = await appendVerified(identityId, chain, sub, { walletAddress: canonicalAddr, verifiedAt }, record.appId);
  } catch (err) {
    bridge(err);
  }

  const appBinding = record.appId ? { appId: record.appId, walletAddress: canonicalAddr } : undefined;
  const respBody: Record<string, unknown> = { walletAddress: canonicalAddr, verifiedAt, appBinding };
  if (chain.includesPrimaryInResponse) respBody.primary = result!.primary;
  return { status: 200, body: respBody };
}

export async function handleLabel(chain: AdditionalChain, identityId: string, body: any): Promise<Result> {
  const canonicalAddr = chain.toAddress(body?.walletAddress);
  if (!canonicalAddr) throw new RouteAbort(400, { message: `walletAddress must be a valid ${chain.provider} address` });
  const cleaned = sanitizeLabel(body?.label);
  if (cleaned === undefined) throw new RouteAbort(400, { message: `label must be a string up to ${MAX_LABEL_LENGTH} chars` });

  const profile = await readProfileByIdentity(identityId);
  const sub = getLink(profile, chain);
  try {
    const { additionalAddresses } = await setLabel(identityId, chain, sub, canonicalAddr, cleaned);
    return { status: 200, body: { walletAddress: canonicalAddr, label: cleaned, additionalAddresses } };
  } catch (err) {
    bridge(err);
  }
}

export async function handleRemove(chain: AdditionalChain, identityId: string, body: any): Promise<Result> {
  const canonicalAddr = chain.toAddress(body?.walletAddress);
  if (!canonicalAddr) throw new RouteAbort(400, { message: `walletAddress must be a valid ${chain.provider} address` });

  const profile = await readProfileByIdentity(identityId);
  const sub = getLink(profile, chain);
  try {
    const { clearedBindings } = await removeAdditional(identityId, chain, sub, canonicalAddr);
    return { status: 200, body: { walletAddress: canonicalAddr, removed: true, clearedBindings } };
  } catch (err) {
    bridge(err);
  }
}

export async function handleAppBinding(chain: AdditionalChain, identityId: string, body: any): Promise<Result> {
  const appId: string | undefined = typeof body?.appId === 'string' ? body.appId.toLowerCase() : undefined;
  const walletAddressRaw = body?.walletAddress;
  if (!appId || !isAppIdValid(appId)) throw new RouteAbort(400, { message: 'appId must match /^[a-z][a-z0-9-]{0,31}$/' });

  const profile = await readProfileByIdentity(identityId);
  const sub = getLink(profile, chain);
  if (!sub) throw new RouteAbort(400, { message: `no ${chain.provider} link` });

  // Empty/null walletAddress = remove the binding (idempotent).
  if (walletAddressRaw === '' || walletAddressRaw === null || walletAddressRaw === undefined) {
    try {
      await removeAppBinding(identityId, chain, sub, appId);
      return { status: 200, body: { appId, removed: true } };
    } catch (err) {
      bridge(err);
    }
  }

  const canonicalAddr = chain.toAddress(walletAddressRaw);
  if (!canonicalAddr) throw new RouteAbort(400, { message: `walletAddress must be a valid ${chain.provider} address` });

  const verifiedSet = collectVerifiedAddresses(chain, sub);
  if (!verifiedSet) throw new RouteAbort(400, { message: `primary ${chain.provider} required` });
  const member = chain.provider === 'solana' ? verifiedSet.has(canonicalAddr) : verifiedSet.has(canonicalAddr.toLowerCase());
  if (!member) throw new RouteAbort(400, { message: 'address not verified for this account' });

  try {
    await setAppBinding(identityId, chain, sub, appId, canonicalAddr);
    return { status: 200, body: { appId, walletAddress: canonicalAddr } };
  } catch (err) {
    bridge(err);
  }
}
