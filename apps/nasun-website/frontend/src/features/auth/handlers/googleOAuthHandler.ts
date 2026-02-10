import { parseJwt } from "@/utils/authUtils";
import { getCognitoIdentityId, getCognitoOidcToken } from "@/features/auth/utils/cognito";
import logger from "@/lib/logger";

export interface GoogleOAuthResult {
  identityId: string;
  cognitoToken?: string;
  userInfo: { name: string; email: string };
}

/**
 * Handles Google OAuth redirect: extracts ID token, parses JWT, gets Cognito identity.
 */
export async function handleGoogleOAuthRedirect(
  url: URL
): Promise<GoogleOAuthResult> {
  const idToken = new URLSearchParams(url.hash.substring(1)).get("id_token");
  logger.debug(
    "Google ID token extracted:",
    idToken ? `${idToken.substring(0, 50)}...` : "null"
  );

  if (!idToken) throw new Error("Google ID token not found in redirect");

  const payload = parseJwt(idToken);
  logger.debug("Parsed Google payload:", payload);

  if (!payload) throw new Error("Failed to parse Google ID token");

  const identityId = await getCognitoIdentityId("Google", idToken);
  if (!identityId) throw new Error("Failed to get Cognito Identity ID");

  // Get signed OIDC token for authenticated API calls
  const cognitoToken = await getCognitoOidcToken(identityId, idToken);

  return {
    identityId,
    cognitoToken,
    userInfo: {
      name: payload.name as string,
      email: payload.email as string,
    },
  };
}
