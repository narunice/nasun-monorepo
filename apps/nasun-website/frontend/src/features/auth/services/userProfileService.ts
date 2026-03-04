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
  identityId: string,
  cognitoToken?: string,
): Promise<void> {
  const updatedProfile = await fetchUserProfile(identityId);

  if (!updatedProfile) {
    throw new Error("Failed to fetch updated profile");
  }

  const { user, updateUserProfile, setUser } = useUserStore.getState();

  // Preserve cognitoToken (not stored in DynamoDB): check store first, then sessionStorage,
  // then the explicit parameter (fallback for mobile redirect where both are cleared).
  let existingToken = user?.cognitoToken;
  if (!existingToken) {
    try {
      const cached = sessionStorage.getItem("nasun_user_profile");
      if (cached) existingToken = JSON.parse(cached).cognitoToken;
    } catch { /* ignore parse error */ }
  }
  if (!existingToken && cognitoToken) {
    existingToken = cognitoToken;
  }
  if (existingToken && !updatedProfile.cognitoToken) {
    updatedProfile.cognitoToken = existingToken;
  }

  if (user) {
    updateUserProfile(updatedProfile);
  } else {
    // OAuth redirect flow: checkAuthStatus was skipped, user is null in store.
    // updateUserProfile silently no-ops when user is null. Use setUser instead.
    setUser(updatedProfile);
  }

  sessionStorage.setItem(
    "nasun_user_profile",
    JSON.stringify(updatedProfile)
  );
  logger.log("User profile refreshed successfully");
}
