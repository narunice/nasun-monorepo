import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { registerWallet } from './handlers/registerWallet';
import { listWallets } from './handlers/listWallets';
import { removeWallet } from './handlers/removeWallet';
import { verifyToken, verifyAddressBookToken, issueAddressBookToken } from './utils/auth';
import {
  getAddressBook, saveAddressBook, createChallenge, consumeNonce,
  ValidationError, PayloadTooLargeError,
} from './handlers/addressBook';
import { verifySuiPersonalSignature, verifyZkLoginEphemeralSignature } from './utils/signature';
import { mirrorIdentityWrite, readProfileFromBox, IDENTITY_ROUTES } from '../../_shared/auth/identity-write';

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

    // No named route matched. The legacy single-wallet root endpoints (GET/POST/DELETE on root,
    // backed by UserProfiles.walletAddress) were removed as dead code: all clients use the
    // multi-wallet routes (/register, /list, /remove) and the address-book routes
    // (/challenge, /verify, /address-book). Anything reaching here is an unknown route.
    return jsonResponse(404, { error: 'Not Found', message: 'Unknown route' });
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

  // Fire-and-forget webhook to explorer-api so the points scanner immediately
  // refreshes its wallet→identity cache and reconciles today's activity for
  // the new wallet. Webhook failure does not affect the registration response;
  // the scanner's 10-min TTL fallback eventually catches up.
  if (result.statusCode === 200) {
    const addr = String(body.walletAddress).toLowerCase();
    notifyWalletRegistered(identityId, addr).catch((err) => {
      console.warn('[registerWallet] sync webhook failed:', err);
    });
    // AWS-exit DAL S1.2: mirror to the box nasun-identity service (best-effort follower; no-op
    // unless wired). Fire-and-forget like the webhook above so a slow/down box never delays the
    // register response; the helper never throws. DynamoDB is SoT and dal-reload (full re-scan)
    // converges any mirror dropped on a Lambda freeze.
    // Carry the DynamoDB-authoritative registeredAt so the box mirror is byte-identical even in the
    // register->next-reload window (S3.R2 /wallet/list reads this field); box falls back if absent.
    void mirrorIdentityWrite(IDENTITY_ROUTES.walletRegister, {
      identityId,
      walletAddress: addr,
      registeredAt: (result.body as { registeredAt?: string }).registeredAt,
    });
  }

  return jsonResponse(result.statusCode, result.body);
}

async function notifyWalletRegistered(identityId: string, walletAddress: string): Promise<void> {
  const baseUrl = process.env.EXPLORER_API_URL || '';
  const token = process.env.EXPLORER_API_INVALIDATE_TOKEN || '';
  if (!baseUrl || !token) return;
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/internal/wallet-registered`;
  // Lambda Node 22 has global fetch.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Auth': token },
      body: JSON.stringify({ identityId, walletAddress }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[registerWallet] webhook ${res.status} ${res.statusText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function handleList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const identityId = await verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!identityId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  // AWS-exit DAL S3.R2: serve the multi-wallet list from the box nasun-identity mirror when the
  // reader is flipped. readProfileFromBox no-ops (returns null) unless IDENTITY_READ_URL/SECRET are
  // wired; the box returns 200 with { wallets: [] } even for an empty list, so a null here means the
  // box is unconfigured, down, or timed out -- fall through to the DynamoDB read. DynamoDB stays SoT.
  if ((process.env.IDENTITY_READ_MODE || '').trim() === 'flip') {
    const boxed = await readProfileFromBox(IDENTITY_ROUTES.walletList, { identityId });
    if (boxed && Array.isArray(boxed.wallets)) {
      return jsonResponse(200, { wallets: boxed.wallets });
    }
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

  // AWS-exit DAL S1.2: mirror to the box nasun-identity service (best-effort follower; no-op unless
  // wired). Fire-and-forget so a slow/down box never delays the remove response; the helper never
  // throws. DynamoDB is SoT and dal-reload converges any mirror dropped on a Lambda freeze.
  if (result.statusCode === 200) {
    void mirrorIdentityWrite(IDENTITY_ROUTES.walletRemove, { identityId, walletAddress: String(body.walletAddress).toLowerCase() });
  }

  return jsonResponse(result.statusCode, result.body);
}
