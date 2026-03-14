import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { getWallet } from './handlers/getWallet';
import { saveWallet } from './handlers/saveWallet';
import { deleteWallet } from './handlers/deleteWallet';
import { registerWallet } from './handlers/registerWallet';
import { listWallets } from './handlers/listWallets';
import { removeWallet } from './handlers/removeWallet';
import { verifyToken } from './utils/auth';
import { getAddressBook, saveAddressBook, ValidationError, PayloadTooLargeError } from './handlers/addressBook';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

let _requestOrigin: string | undefined;
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(_requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

// Extract the last path segment: /prod/register -> register, /prod/ -> ''
function getPathSegment(path: string): string {
  const segments = path.replace(/\/+$/, '').split('/');
  const last = segments[segments.length - 1] || '';
  // If the last segment is a stage name (prod, dev, etc.), treat as root
  if (['prod', 'dev', 'staging'].includes(last)) return '';
  return last;
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  _requestOrigin = event.headers?.origin || event.headers?.Origin;
  const pathSegment = getPathSegment(event.path);

  console.log('Wallet API invoked:', {
    httpMethod: event.httpMethod,
    path: event.path,
    pathSegment,
  });

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    // New multi-wallet endpoints (JWT auth via jose)
    if (pathSegment === 'register' && event.httpMethod === 'POST') {
      return await handleRegister(event);
    }
    if (pathSegment === 'list' && event.httpMethod === 'GET') {
      return await handleList(event);
    }
    if (pathSegment === 'remove' && event.httpMethod === 'POST') {
      return await handleRemove(event);
    }
    if (pathSegment === 'address-book' && event.httpMethod === 'GET') {
      return await handleGetAddressBook(event);
    }
    if (pathSegment === 'address-book' && event.httpMethod === 'POST') {
      return await handleSaveAddressBook(event);
    }

    // Legacy single-wallet endpoints (existing auth via requestContext)
    const identityId = event.requestContext.authorizer?.claims?.sub;
    if (!identityId) {
      return jsonResponse(401, { error: 'Unauthorized', message: 'No identity found in token' });
    }

    switch (event.httpMethod) {
      case 'GET': {
        const wallet = await getWallet({ identityId });
        if (!wallet) {
          return jsonResponse(404, { error: 'Not Found', message: 'No wallet address found' });
        }
        return jsonResponse(200, wallet);
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}');
        if (!body.walletAddress) {
          return jsonResponse(400, { error: 'Bad Request', message: 'walletAddress is required' });
        }
        const wallet = await saveWallet({
          identityId,
          walletAddress: body.walletAddress,
          blockchain: body.blockchain
        });
        return jsonResponse(200, wallet);
      }

      case 'DELETE': {
        await deleteWallet({ identityId });
        return { statusCode: 204, headers: corsHeaders(), body: '' };
      }

      default:
        return jsonResponse(405, { error: 'Method Not Allowed' });
    }
  } catch (error: unknown) {
    console.error('Error processing request:', error);
    return jsonResponse(500, { error: 'Internal Server Error' });
  }
};

// --- New multi-wallet handlers with JWT auth ---

async function handleRegister(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const body = JSON.parse(event.body || '{}');
  if (!body.walletAddress || !body.walletProof || !body.proofIssuedAt) {
    return jsonResponse(400, { error: 'walletAddress, walletProof, and proofIssuedAt are required' });
  }

  const result = await registerWallet({
    identityId,
    walletAddress: body.walletAddress,
    walletProof: body.walletProof,
    proofIssuedAt: body.proofIssuedAt,
  });

  return jsonResponse(result.statusCode, result.body);
}

async function handleList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const wallets = await listWallets(identityId);
  return jsonResponse(200, { wallets });
}

async function handleRemove(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const body = JSON.parse(event.body || '{}');
  if (!body.walletAddress) {
    return jsonResponse(400, { error: 'walletAddress is required' });
  }

  const result = await removeWallet({
    identityId,
    walletAddress: body.walletAddress,
  });

  return jsonResponse(result.statusCode, result.body);
}

async function handleGetAddressBook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const { addressBook, version } = await getAddressBook(identityId);
  return jsonResponse(200, {
    addressBook: addressBook ?? { entries: {}, updatedAt: 0 },
    version,
  });
}

async function handleSaveAddressBook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  if (!body.addressBook || typeof body.addressBook !== 'object') {
    return jsonResponse(400, { error: 'addressBook is required' });
  }

  const expectedVersion = typeof body.version === 'number' ? body.version : 0;

  try {
    const result = await saveAddressBook(
      identityId,
      body.addressBook as any,
      expectedVersion,
    );

    if (result.conflict) {
      return jsonResponse(409, { error: 'Version conflict', message: 'Address book was modified by another device' });
    }

    return jsonResponse(200, { success: true });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return jsonResponse(400, { error: error.message });
    }
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse(413, { error: error.message });
    }
    throw error;
  }
}
