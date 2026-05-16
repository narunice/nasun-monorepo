import { createRemoteJWKSet, jwtVerify } from 'jose';

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
 * Verify a Bearer token from the Authorization header and return the
 * Cognito identityId (JWT `sub`). Returns undefined on any failure.
 */
export async function verifyJwtIdentity(authHeader: string | undefined): Promise<string | undefined> {
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
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return undefined;
  }
}
