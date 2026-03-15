import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { randomBytes } from 'crypto';

const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri')
    );
  }
  return jwksInstance;
}

/**
 * Verify a Bearer token and extract identityId from Cognito JWT.
 * Returns undefined if verification fails.
 * NOTE: This function is ONLY for Cognito JWTs (register/list/remove).
 *       For address book auth, use verifyAddressBookToken() instead.
 */
export async function verifyToken(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error('COGNITO_IDENTITY_POOL_ID is not set');
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return undefined;
  }
}

// ---- Address Book JWT (self-issued, separate from Cognito) ----

const AB_JWT_ISSUER = 'nasun-ab';
const AB_JWT_AUDIENCE = 'address-book';
const AB_JWT_TTL_SECONDS = 3600; // 1 hour

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
let cachedAbJwtKey: Uint8Array | null = null;

/**
 * Get or create the address book JWT signing key from Secrets Manager.
 * Uses a separate field (`addressBookJwtKey`) from the wallet-proof HMAC secret
 * to prevent cross-protocol attacks.
 */
async function getAddressBookJwtKey(): Promise<Uint8Array> {
  if (cachedAbJwtKey) return cachedAbJwtKey;

  const secretName = process.env.WALLET_PROOF_SECRET_NAME;
  if (!secretName) {
    throw new Error('WALLET_PROOF_SECRET_NAME environment variable not set.');
  }

  const data = await smClient.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!data.SecretString) {
    throw new Error('SecretString is empty in Secrets Manager response.');
  }

  const secrets = JSON.parse(data.SecretString);

  if (secrets.addressBookJwtKey) {
    cachedAbJwtKey = new TextEncoder().encode(secrets.addressBookJwtKey);
  } else {
    // First run: generate a key and store it
    const newKey = randomBytes(48).toString('base64');
    secrets.addressBookJwtKey = newKey;

    const { SecretsManagerClient: _, PutSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    await smClient.send(new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(secrets),
    }));

    cachedAbJwtKey = new TextEncoder().encode(newKey);
    console.log('[address-book-auth] Generated and stored new JWT signing key');
  }

  return cachedAbJwtKey;
}

/**
 * Issue a short-lived JWT for address book access.
 * sub = walletAddress (NOT identityId).
 */
export async function issueAddressBookToken(walletAddress: string): Promise<string> {
  const key = await getAddressBookJwtKey();

  return new SignJWT({ sub: walletAddress })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(AB_JWT_ISSUER)
    .setAudience(AB_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${AB_JWT_TTL_SECONDS}s`)
    .sign(key);
}

/**
 * Verify an address-book JWT and extract walletAddress.
 * Completely separate from verifyToken (Cognito).
 * Returns undefined if verification fails.
 */
export async function verifyAddressBookToken(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);

  try {
    const key = await getAddressBookJwtKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: AB_JWT_ISSUER,
      audience: AB_JWT_AUDIENCE,
    });
    return payload.sub;
  } catch (error) {
    console.error('[address-book-auth] JWT verification failed:', error);
    return undefined;
  }
}
