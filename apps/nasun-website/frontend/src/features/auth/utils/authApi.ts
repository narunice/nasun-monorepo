import logger from "@/lib/logger";
import type { UserData } from "@/store/userStore";

// Twitter OAuth Callback
export const handleTwitterCallback = async (code: string, state: string, sessionId: string) => {
  const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, state, sessionId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Twitter OAuth callback failed");
  }

  return await response.json();
};

// Account Linking
export const linkAccounts = async (
  primaryIdentityId: string,
  secondaryIdentityId: string,
  secondaryProvider: "Google" | "Twitter",
  cognitoToken?: string
) => {
  if (!cognitoToken) {
    throw new Error("Session expired. Please sign in again to link accounts.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${cognitoToken}`,
  };

  const response = await fetch(`${import.meta.env.VITE_LINK_ACCOUNT_API}/link`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      primaryIdentityId,
      secondaryIdentityId,
      secondaryProvider,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to link accounts");
  }

  return await response.json();
};

// User Profile Management
export const createUserProfile = async (userData: UserData): Promise<void> => {
  try {
    const payload = JSON.stringify(userData);
    logger.log("Creating user profile with payload:", payload);

    const response = await fetch(`${import.meta.env.VITE_USER_PROFILE_API}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("POST failed with status:", response.status, "Body:", errorText);
      throw new Error(`Failed to create user profile: ${response.status} - ${errorText}`);
    }

    logger.log("User profile created successfully:", userData.identityId);
  } catch (error) {
    logger.error("Error creating user profile:", error);
    throw error;
  }
};

export const fetchUserProfile = async (identityId: string): Promise<UserData | null> => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_USER_PROFILE_API}?identityId=${identityId}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch user profile");
    }

    return await response.json();
  } catch (error) {
    logger.error("Error fetching user profile:", error);
    return null;
  }
};

export const ensureUserProfile = async (userData: UserData): Promise<UserData | null> => {
  try {
    // 1. Check if profile exists
    let profile = await fetchUserProfile(userData.identityId);

    // 2. If not, create it
    if (!profile) {
      logger.log("User profile not found, creating...", userData.identityId);
      await createUserProfile(userData);
      profile = await fetchUserProfile(userData.identityId);
    }

    return profile;
  } catch (error) {
    logger.error("Error ensuring user profile:", error);
    return null;
  }
};
