import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toChecksum } from '../utils/ethereum';
import { removeAdditionalAddress } from '../utils/userProfile';
import { badRequest, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

export async function handleRemove(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'DELETE') return methodNotAllowed(headers);

  // DELETE bodies are unusual but supported by API Gateway; the spec
  // accepts walletAddress here (matches handoff). Query string fallback
  // for clients that strip DELETE bodies.
  const body = (() => {
    try {
      return JSON.parse(event.body || '{}');
    } catch {
      return {};
    }
  })();
  const walletAddressRaw: string | undefined =
    body.walletAddress || event.queryStringParameters?.walletAddress;

  const checksum = toChecksum(walletAddressRaw);
  if (!checksum) return badRequest('walletAddress must be a valid EVM address', headers);

  try {
    const { clearedBindings } = await removeAdditionalAddress(identityId, checksum);
    return json(200, { walletAddress: checksum, removed: true, clearedBindings }, headers);
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const msg = (err as Error).message || 'Failed to remove address';
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'Concurrent update detected. Please retry.', code: 'RACE' }, headers);
    }
    return json(status && status >= 400 && status < 500 ? status : 500, { message: msg }, headers);
  }
}
