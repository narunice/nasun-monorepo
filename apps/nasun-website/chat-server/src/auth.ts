import { createRemoteJWKSet, jwtVerify } from 'jose';

// JWKS is cached automatically by jose (module scope)
const JWKS = createRemoteJWKSet(
  new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri')
);

const IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

if (!IDENTITY_POOL_ID) {
  throw new Error('FATAL: COGNITO_IDENTITY_POOL_ID environment variable is required');
}

export interface AuthResult {
  userId: string;  // Cognito identityId (sub claim)
}

/**
 * Verify a Cognito Identity Pool OIDC JWT token.
 * Returns the identityId on success, null on failure.
 */
export async function verifyCognitoJwt(token: string): Promise<AuthResult | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: IDENTITY_POOL_ID,
    });

    const userId = payload.sub;
    if (!userId) {
      console.warn('Token missing sub claim');
      return null;
    }

    return { userId };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // Debug: log token header to diagnose auth failures
    try {
      const [headerB64] = token.split('.');
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      console.warn('JWT verification failed:', msg, '| token header:', JSON.stringify(header));
    } catch {
      console.warn('JWT verification failed:', msg, '| token is not a valid JWT format');
    }
    return null;
  }
}
