import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toSuiAddress } from '../utils/sui';
import {
  getProfile,
  getSuiLink,
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

  let body: { appId?: unknown; walletAddress?: unknown };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return badRequest('Invalid JSON body', headers);
  }
  const appId: string | undefined =
    typeof body.appId === 'string' ? body.appId.toLowerCase() : undefined;
  const walletAddressRaw: string | null | undefined =
    typeof body.walletAddress === 'string'
      ? body.walletAddress
      : (body.walletAddress as null | undefined);

  if (!appId || !isAppIdValid(appId)) {
    return badRequest('appId must match /^[a-z][a-z0-9-]{0,31}$/', headers);
  }

  const profile = await getProfile(identityId);
  const sui = getSuiLink(profile);
  if (!sui) return badRequest('no sui link', headers);

  if (walletAddressRaw === '' || walletAddressRaw === null || walletAddressRaw === undefined) {
    await removeAppBinding(identityId, appId);
    return json(200, { appId, removed: true }, headers);
  }

  const canonicalAddr = toSuiAddress(walletAddressRaw);
  if (!canonicalAddr) return badRequest('walletAddress must be a valid Sui address', headers);

  const verifiedSet = collectVerifiedAddresses(sui);
  if (!verifiedSet) return badRequest('primary sui required', headers);
  if (!verifiedSet.has(canonicalAddr)) {
    return badRequest('address not verified for this account', headers);
  }

  await setAppBinding(identityId, appId, canonicalAddr);
  return json(200, { appId, walletAddress: canonicalAddr }, headers);
}
