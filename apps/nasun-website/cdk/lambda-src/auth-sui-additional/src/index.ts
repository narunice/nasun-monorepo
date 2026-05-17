import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyJwtIdentity } from '../../_shared/additional-link/identity';
import { corsHeaders, methodNotAllowed, serverError, unauthorized, json } from '../../_shared/additional-link/responses';
import { handleChallenge } from './handlers/challenge';
import { handleVerify } from './handlers/verify';
import { handleAppBinding } from './handlers/app-binding';
import { handleRemove } from './handlers/remove';
import { handleLabel } from './handlers/label';

// Path layout (mounted at the API root) -- mirrors EVM/Solana additional Lambdas:
//   POST   /additional-address/challenge
//   POST   /additional-address/verify
//   PATCH  /additional-address/label
//   DELETE /additional-address
//   PATCH  /app-binding
type Route = 'challenge' | 'verify' | 'label' | 'app-binding' | 'remove';

function routeOf(event: APIGatewayProxyEvent): Route | null {
  const p = (event.path || event.resource || '').toLowerCase();
  if (p.includes('/additional-address/challenge') || p.endsWith('/challenge')) return 'challenge';
  if (p.includes('/additional-address/verify') || p.endsWith('/verify')) return 'verify';
  if (p.includes('/additional-address/label') || p.endsWith('/label')) return 'label';
  if (p.includes('/app-binding')) return 'app-binding';
  if (p.includes('/additional-address')) return 'remove';
  return null;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const identityId = await verifyJwtIdentity(authHeader);
    if (!identityId) return unauthorized(headers);

    const route = routeOf(event);
    if (!route) return json(404, { message: 'Not Found' }, headers);

    switch (route) {
      case 'challenge':
        return await handleChallenge(event, identityId, headers);
      case 'verify':
        return await handleVerify(event, identityId, headers);
      case 'label':
        return await handleLabel(event, identityId, headers);
      case 'app-binding':
        return await handleAppBinding(event, identityId, headers);
      case 'remove':
        return await handleRemove(event, identityId, headers);
      default:
        return methodNotAllowed(headers);
    }
  } catch (err: unknown) {
    console.error('[auth-sui-additional] unhandled:', (err as Error)?.message);
    return serverError(headers);
  }
};
