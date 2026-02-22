import { fetchUserProfile } from "@/features/auth/utils/authApi";
import { useUserStore } from "@/store/userStore";
import logger from "@/lib/logger";

/**
 * Refreshes user profile from server and updates both Zustand store and sessionStorage.
 * Centralizes the profile refresh pattern previously duplicated in 5+ locations.
 *
 * Always uses sessionStorage (not localStorage) for security - sessionStorage is
 * cleared when the tab closes and is not accessible across tabs, reducing XSS exposure.
 */
export async function refreshAndSaveUserProfile(
  identityId: string
): Promise<void> {
  const updatedProfile = await fetchUserProfile(identityId);

  if (!updatedProfile) {
    throw new Error("Failed to fetch updated profile");
  }

  // Preserve cognitoToken from current session (not stored in DynamoDB)
  const { user, updateUserProfile } = useUserStore.getState();
  if (user?.cognitoToken && !updatedProfile.cognitoToken) {
    updatedProfile.cognitoToken = user.cognitoToken;
  }

  updateUserProfile(updatedProfile);
  sessionStorage.setItem(
    "nasun_user_profile",
    JSON.stringify(updatedProfile)
  );
  logger.log("User profile refreshed successfully");
}
