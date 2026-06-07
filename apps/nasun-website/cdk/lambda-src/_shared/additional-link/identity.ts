import { verifyIdentityFromBearer } from '../auth/dual-jwks';

/**
 * Verify a Bearer token from the Authorization header and return the identityId (JWT `sub`).
 * Returns undefined on any failure. Delegates to the shared dual-JWKS verifier (Cognito + nasun-issuer
 * during the AWS-exit grace window); kept as a named export so additional-link consumers are unchanged.
 */
export async function verifyJwtIdentity(authHeader: string | undefined): Promise<string | undefined> {
  return verifyIdentityFromBearer(authHeader);
}
