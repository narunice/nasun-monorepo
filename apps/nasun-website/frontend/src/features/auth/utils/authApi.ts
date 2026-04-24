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
interface SecondaryProfileInfo {
  username: string;
  email?: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
}

export interface LinkConflictDetail {
  existingPrimary: {
    identityId: string;
    walletAddress: string | null;
    username: string | null;
  };
}

export class LinkNeedsConfirmError extends Error {
  code = "LINK_NEEDS_CONFIRM" as const;
  detail: LinkConflictDetail;
  constructor(message: string, detail: LinkConflictDetail) {
    super(message);
    this.name = "LinkNeedsConfirmError";
    this.detail = detail;
  }
}

export const linkAccounts = async (
  primaryIdentityId: string,
  secondaryIdentityId: string,
  secondaryProvider: "Google" | "Twitter",
  cognitoToken?: string,
  secondaryInfo?: SecondaryProfileInfo,
  options?: { confirmTransfer?: boolean },
) => {
  if (!cognitoToken) {
    throw new Error("Session expired. Please sign in again to link accounts.");
  }

  const response = await fetch(`${import.meta.env.VITE_LINK_ACCOUNT_API}/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cognitoToken}`,
    },
    body: JSON.stringify({
      primaryIdentityId,
      secondaryIdentityId,
      secondaryProvider,
      ...(options?.confirmTransfer === true && { confirmTransfer: true }),
      ...(secondaryInfo && {
        secondaryUsername: secondaryInfo.username,
        secondaryEmail: secondaryInfo.email,
        secondaryTwitterHandle: secondaryInfo.twitterHandle,
        secondaryOriginalTwitterHandle: secondaryInfo.originalTwitterHandle,
        secondaryTwitterId: secondaryInfo.twitterId,
        secondaryProfileImageUrl: secondaryInfo.profileImageUrl,
      }),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 409 && errorData?.code === "LINK_NEEDS_CONFIRM" && errorData?.existingPrimary) {
      throw new LinkNeedsConfirmError(
        errorData.message || "This account is already linked to another wallet.",
        { existingPrimary: errorData.existingPrimary },
      );
    }
    throw new Error(errorData?.message || "Failed to link accounts");
  }

  return await response.json();
};

// User Profile Management
export const createUserProfile = async (userData: UserData): Promise<void> => {
  if (!userData.cognitoToken) {
    throw new Error("Session expired. Please sign in again.");
  }

  try {
    const { cognitoToken, ...profileData } = userData;
    const payload = JSON.stringify(profileData);
    logger.log("Creating user profile for:", userData.identityId);

    const response = await fetch(`${import.meta.env.VITE_USER_PROFILE_API}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cognitoToken}`,
      },
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
    const profile = await fetchUserProfile(userData.identityId);
    if (profile) return profile;

    logger.log("User profile not found, creating...", userData.identityId);
    await createUserProfile(userData);
    return userData;
  } catch (error) {
    logger.error("Error ensuring user profile:", error);
    return null;
  }
};
