import type { UserData } from "@/store/userStore";

/**
 * Resolve Twitter handle from both primary provider and linked accounts.
 * Primary provider field (`twitterHandle`) is set only when Twitter is the login method.
 * Linked account field is set when Twitter is connected as a secondary account.
 * Returns the normalized (lowercase) handle used for API lookups.
 */
export function getTwitterHandle(user: UserData | null): string | null {
  if (!user) return null;
  return user.twitterHandle || user.linkedAccounts?.twitter?.twitterHandle || null;
}

/**
 * Resolve the original-casing Twitter handle for display purposes.
 * Falls back to the normalized handle if original is unavailable.
 */
export function getOriginalTwitterHandle(user: UserData | null): string | null {
  if (!user) return null;
  return (
    user.originalTwitterHandle ||
    user.linkedAccounts?.twitter?.originalTwitterHandle ||
    user.twitterHandle ||
    user.linkedAccounts?.twitter?.twitterHandle ||
    null
  );
}
