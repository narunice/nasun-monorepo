import type { UserData } from "@/store/userStore";

/**
 * Resolve Twitter handle from both primary provider and linked accounts.
 * Primary provider field (`twitterHandle`) is set only when Twitter is the login method.
 * Linked account field is set when Twitter is connected as a secondary account.
 */
export function getTwitterHandle(user: UserData | null): string | null {
  if (!user) return null;
  return user.twitterHandle || user.linkedAccounts?.twitter?.twitterHandle || null;
}
