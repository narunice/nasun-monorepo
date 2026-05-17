import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toSuiAddress } from '../utils/sui';
import {
  sanitizeLabel,
  setAdditionalAddressLabel,
  MAX_LABEL_LENGTH,
} from '../utils/userProfile';
import { badRequest, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

export async function handleLabel(
  event: APIGatewayProxyEvent,
  identityId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== 'PATCH') return methodNotAllowed(headers);

  const body = (() => {
    try {
      return JSON.parse(event.body || '{}');
    } catch {
      return {};
    }
  })();

  const canonicalAddr = toSuiAddress(body.walletAddress);
  if (!canonicalAddr) {
    return badRequest('walletAddress must be a valid Sui address', headers);
  }

  const cleaned = sanitizeLabel(body.label);
  if (cleaned === undefined) {
    return badRequest(`label must be a string up to ${MAX_LABEL_LENGTH} chars`, headers);
  }

  try {
    const { additionalAddresses } = await setAdditionalAddressLabel(
      identityId,
      canonicalAddr,
      cleaned,
    );
    return json(
      200,
      {
        walletAddress: canonicalAddr,
        label: cleaned,
        additionalAddresses,
      },
      headers,
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const msg = (err as Error).message || 'Failed to set label';
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'Concurrent update detected. Please retry.', code: 'RACE' }, headers);
    }
    return json(
      status && status >= 400 && status < 500 ? status : 500,
      { message: msg },
      headers,
    );
  }
}
