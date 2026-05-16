import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toChecksum } from '../utils/ethereum';
import {
  sanitizeLabel,
  setAdditionalAddressLabel,
  MAX_LABEL_LENGTH,
} from '../utils/userProfile';
import { badRequest, json, methodNotAllowed } from '../../../_shared/additional-link/responses';

/**
 * PATCH /additional-address/label
 *
 * Body: { walletAddress: string, label: string | null }
 *
 * Sets or clears the user-supplied label on a verified additional EVM
 * address. Primary address has no label slot — server rejects.
 *
 * Labels are read-modify-write with an optimistic lock; the entry must
 * already exist in `additionalAddresses[]`.
 */
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

  const checksum = toChecksum(body.walletAddress);
  if (!checksum) {
    return badRequest('walletAddress must be a valid EVM address', headers);
  }

  // sanitizeLabel returns:
  //   null      → caller wants to clear the label
  //   undefined → invalid input (wrong type, too long, etc.) → 400
  //   string    → sanitized label
  const cleaned = sanitizeLabel(body.label);
  if (cleaned === undefined) {
    return badRequest(`label must be a string up to ${MAX_LABEL_LENGTH} chars`, headers);
  }

  try {
    const { additionalAddresses } = await setAdditionalAddressLabel(
      identityId,
      checksum,
      cleaned,
    );
    return json(
      200,
      {
        walletAddress: checksum,
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
