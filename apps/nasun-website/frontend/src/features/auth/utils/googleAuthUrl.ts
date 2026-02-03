import { generateCodeVerifier } from "@/utils/authUtils";

/**
 * Builds a Google OAuth 2.0 authorization URL for login or account linking.
 * Uses crypto.getRandomValues()-based nonce via generateCodeVerifier().
 */
export function buildGoogleAuthUrl(): string {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error("Google Client ID is not configured");
  }

  const redirectUri = `${window.location.origin}/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.append("client_id", googleClientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "id_token");
  authUrl.searchParams.append("scope", "openid email profile");
  authUrl.searchParams.append("nonce", generateCodeVerifier(32));
  authUrl.searchParams.append("prompt", "select_account");

  return authUrl.toString();
}
