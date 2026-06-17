import logger from "@/lib/logger";

export interface GoogleOAuthResult {
  identityId: string;
  cognitoToken?: string;
  userInfo: { name: string; email: string };
}

/**
 * Handles the Google OAuth redirect: extracts the implicit-flow id_token from the URL hash and verifies
 * it SERVER-SIDE at the box (POST /auth/google/verify). The box validates the token (Google JWKS +
 * audience + issuer + expiry) and mints the stable identityId via the issuer
 * (developerUserIdentifier "google:<sub>"). This replaces the former browser-side Cognito federated
 * GetId / GetOpenIdToken (features/auth/utils/cognito.ts) -- the last Cognito Identity Pool dependency.
 *
 * Google OAuth is account-LINKING only (primary login is the Nasun wallet; AuthProvider blocks the
 * non-linking flow), so the returned identityId is the SECONDARY identity passed to linkAccounts. It is
 * orphan-safe: the box returns the same identityId Cognito assigned, because issuer.identity_map was
 * seeded from the Stage-1 Cognito export (keyed by "google:<sub>"). The result token is not consumed by
 * linking (linkAccounts authenticates with the PRIMARY's token); it is kept on the result for interface
 * parity only.
 */
export async function handleGoogleOAuthRedirect(
  url: URL
): Promise<GoogleOAuthResult> {
  const idToken = new URLSearchParams(url.hash.substring(1)).get("id_token");
  if (!idToken) throw new Error("Google ID token not found in redirect");

  const verifyUrl = import.meta.env.VITE_GOOGLE_LOGIN_API_URL;
  if (!verifyUrl) throw new Error("Google login endpoint is not configured");

  const res = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    logger.error(`Google verification failed: HTTP ${res.status}`);
    throw new Error("Failed to verify Google credential");
  }

  const data = (await res.json()) as {
    identityId?: string;
    token?: string;
    userInfo?: { name?: string; email?: string };
  };
  if (!data.identityId) {
    throw new Error("Failed to get identity from Google verification");
  }

  return {
    identityId: data.identityId,
    cognitoToken: data.token,
    userInfo: {
      name: data.userInfo?.name ?? "",
      email: data.userInfo?.email ?? "",
    },
  };
}
