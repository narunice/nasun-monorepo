import { fetchUserProfile } from "@/features/auth/utils/authApi";
import { useUserStore } from "@/store/userStore";
import logger from "@/lib/logger";

/**
 * Refreshes user profile from server and updates both Zustand store and localStorage.
 * Centralizes the profile refresh pattern previously duplicated in 5+ locations.
 *
 * Uses localStorage for persistent sessions across tabs and browser restarts.
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
      const cached = localStorage.getItem("nasun_user_profile");
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

  localStorage.setItem(
    "nasun_user_profile",
    JSON.stringify(updatedProfile)
  );
  logger.log("User profile refreshed successfully");
}
