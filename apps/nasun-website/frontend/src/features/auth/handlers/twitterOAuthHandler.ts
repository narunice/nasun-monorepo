import { handleTwitterCallback } from "@/features/auth/utils/authApi";

export interface TwitterOAuthResult {
  identityId: string;
  cognitoToken?: string;
  userInfo: { name: string };
  twitterHandle?: string;
  originalTwitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
}

/**
 * Handles Twitter OAuth redirect: exchanges code for user data via backend.
 */
export async function handleTwitterOAuthRedirect(
  url: URL,
  sessionId: string
): Promise<TwitterOAuthResult> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !sessionId) {
    throw new Error("Missing Twitter OAuth parameters");
  }

  const twitterUserData = await handleTwitterCallback(code, state, sessionId);

  return {
    identityId: twitterUserData.identityId,
    cognitoToken: twitterUserData.cognitoToken,
    userInfo: { name: twitterUserData.username || "Twitter User" },
    twitterHandle: twitterUserData.twitterHandle,
    originalTwitterHandle: twitterUserData.originalTwitterHandle,
    twitterId: twitterUserData.twitterId,
    profileImageUrl: twitterUserData.profileImageUrl,
  };
}
