import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toSolAddress } from '../utils/solana';
import { removeAdditionalAddress } from '../utils/userProfile';
import { badRequest, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

export async function handleRemove(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'DELETE') return methodNotAllowed(headers);

  const body = (() => {
    try {
      return JSON.parse(event.body || '{}');
    } catch {
      return {};
    }
  })();
  const walletAddressRaw: string | undefined =
    body.walletAddress || event.queryStringParameters?.walletAddress;

  const canonicalAddr = toSolAddress(walletAddressRaw);
  if (!canonicalAddr) return badRequest('walletAddress must be a valid Solana address', headers);

  try {
    const { clearedBindings } = await removeAdditionalAddress(identityId, canonicalAddr);
    return json(200, { walletAddress: canonicalAddr, removed: true, clearedBindings }, headers);
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const msg = (err as Error).message || 'Failed to remove address';
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'Concurrent update detected. Please retry.', code: 'RACE' }, headers);
    }
    return json(status && status >= 400 && status < 500 ? status : 500, { message: msg }, headers);
  }
}
