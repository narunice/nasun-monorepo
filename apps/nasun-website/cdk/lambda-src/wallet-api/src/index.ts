import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { getWallet } from './handlers/getWallet';
import { saveWallet } from './handlers/saveWallet';
import { deleteWallet } from './handlers/deleteWallet';
import { registerWallet } from './handlers/registerWallet';
import { listWallets } from './handlers/listWallets';
import { removeWallet } from './handlers/removeWallet';
import { verifyToken, verifyAddressBookToken, issueAddressBookToken } from './utils/auth';
import {
  getAddressBook, saveAddressBook, createChallenge, consumeNonce,
  ValidationError, PayloadTooLargeError,
} from './handlers/addressBook';
import { verifySuiPersonalSignature, verifyZkLoginEphemeralSignature } from './utils/signature';

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
    // --- Address Book Auth (no JWT required) ---
    if (pathSegment === 'challenge' && event.httpMethod === 'POST') {
      return await handleChallenge(event);
    }
    if (pathSegment === 'verify' && event.httpMethod === 'POST') {
      return await handleVerify(event);
    }

    // --- Address Book CRUD (self-issued JWT auth) ---
    if (pathSegment === 'address-book' && event.httpMethod === 'GET') {
      return await handleGetAddressBook(event);
    }
    if (pathSegment === 'address-book' && event.httpMethod === 'POST') {
      return await handleSaveAddressBook(event);
    }

    // --- Multi-wallet endpoints (Cognito JWT auth via jose) ---
    if (pathSegment === 'register' && event.httpMethod === 'POST') {
      return await handleRegister(event);
    }
    if (pathSegment === 'list' && event.httpMethod === 'GET') {
      return await handleList(event);
    }
    if (pathSegment === 'remove' && event.httpMethod === 'POST') {
      return await handleRemove(event);
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

// --- Address Book Auth handlers ---

async function handleChallenge(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const walletAddress = body.walletAddress;
  if (typeof walletAddress !== 'string' || !walletAddress) {
    return jsonResponse(400, { error: 'walletAddress is required' });
  }

  try {
    const result = await createChallenge(walletAddress.toLowerCase());
    console.log('[address-book] Challenge created for', walletAddress.slice(0, 10));
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonResponse(400, { error: error.message });
    }
    throw error;
  }
}

async function handleVerify(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { signature, nonce, walletAddress, ephemeralPublicKey } = body as {
    signature?: string;
    nonce?: string;
    walletAddress?: string;
    ephemeralPublicKey?: string;
  };

  if (!signature || !nonce) {
    return jsonResponse(400, { error: 'signature and nonce are required' });
  }

  // Atomically consume nonce (prevents replay)
  const nonceData = await consumeNonce(nonce);
  if (!nonceData) {
    console.warn('[address-book] Nonce not found or expired');
    return jsonResponse(401, { error: 'Authentication failed' });
  }

  const messageBytes = new TextEncoder().encode(nonceData.message);

  try {
    let verifiedAddress: string;

    if (ephemeralPublicKey) {
      // zkLogin path: verify ephemeral key signature
      if (!walletAddress) {
        return jsonResponse(400, { error: 'walletAddress is required for zkLogin auth' });
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // Verify walletAddress binding (prevents impersonation)
      if (normalizedAddress !== nonceData.boundWalletAddress) {
        console.warn('[address-book] walletAddress mismatch with challenge binding');
        return jsonResponse(401, { error: 'Authentication failed' });
      }

      const isValid = await verifyZkLoginEphemeralSignature(messageBytes, signature, ephemeralPublicKey);
      if (!isValid) {
        console.warn('[address-book] zkLogin ephemeral signature verification failed');
        return jsonResponse(401, { error: 'Authentication failed' });
      }

      verifiedAddress = normalizedAddress;
    } else {
      // Self-custody path: recover address from signature
      const recoveredAddress = await verifySuiPersonalSignature(messageBytes, signature);

      // Verify recovered address matches challenge binding
      if (recoveredAddress !== nonceData.boundWalletAddress) {
        console.warn('[address-book] Recovered address does not match challenge binding');
        return jsonResponse(401, { error: 'Authentication failed' });
      }

      verifiedAddress = recoveredAddress;
    }

    // Issue session JWT
    const token = await issueAddressBookToken(verifiedAddress);
    console.log('[address-book] Token issued for', verifiedAddress.slice(0, 10));

    return jsonResponse(200, { token, walletAddress: verifiedAddress });
  } catch (error) {
    console.error('[address-book] Signature verification error:', error);
    return jsonResponse(401, { error: 'Authentication failed' });
  }
}

// --- Address Book CRUD handlers (self-issued JWT auth) ---

async function handleGetAddressBook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const walletAddress = await verifyAddressBookToken(event.headers?.Authorization || event.headers?.authorization);
  if (!walletAddress) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const { addressBook, version } = await getAddressBook(walletAddress);
  return jsonResponse(200, {
    addressBook: addressBook ?? { entries: {}, updatedAt: 0 },
    version,
  });
}

async function handleSaveAddressBook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const walletAddress = await verifyAddressBookToken(event.headers?.Authorization || event.headers?.authorization);
  if (!walletAddress) {
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
      walletAddress,
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

// --- Multi-wallet handlers with Cognito JWT auth (unchanged) ---

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
