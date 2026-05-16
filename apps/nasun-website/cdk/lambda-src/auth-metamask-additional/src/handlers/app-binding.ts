import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toChecksum } from '../utils/ethereum';
import {
  getProfile,
  getMetaMaskLink,
  collectVerifiedAddresses,
  isAppIdValid,
  setAppBinding,
  removeAppBinding,
} from '../utils/userProfile';
import { badRequest, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

export async function handleAppBinding(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'PATCH') return methodNotAllowed(headers);

  const body = JSON.parse(event.body || '{}');
  const appId: string | undefined =
    typeof body.appId === 'string' ? body.appId.toLowerCase() : undefined;
  const walletAddressRaw: string | null | undefined = body.walletAddress;

  if (!appId || !isAppIdValid(appId)) {
    return badRequest('appId must match /^[a-z][a-z0-9-]{0,31}$/', headers);
  }

  const profile = await getProfile(identityId);
  const meta = getMetaMaskLink(profile);
  if (!meta) return badRequest('no metamask link', headers);

  // Empty string / null is the documented signal to clear the binding.
  if (walletAddressRaw === '' || walletAddressRaw === null || walletAddressRaw === undefined) {
    await removeAppBinding(identityId, appId);
    return json(200, { appId, removed: true }, headers);
  }

  const checksum = toChecksum(walletAddressRaw);
  if (!checksum) return badRequest('walletAddress must be a valid EVM address', headers);

  const verifiedSet = collectVerifiedAddresses(meta);
  if (!verifiedSet) return badRequest('primary metamask required', headers);
  if (!verifiedSet.has(checksum.toLowerCase())) {
    return badRequest('address not verified for this account', headers);
  }

  await setAppBinding(identityId, appId, checksum);
  return json(200, { appId, walletAddress: checksum }, headers);
}
