import { useMemo } from "react";
import { resolveAvatarUrl } from "@nasun/profile-core";
import type { UserData } from "@/store/userStore";

const PUBLIC_AVATARS_BASE_URL = import.meta.env.VITE_PUBLIC_AVATARS_BASE_URL ?? '';

interface LoginIdentifier {
  label: string;
  value: string;
}

function getLoginIdentifier(
  user: Pick<UserData, 'provider' | 'email' | 'twitterHandle' | 'originalTwitterHandle' | 'walletAddress'> | null,
): LoginIdentifier | null {
  if (!user) return null;

  switch (user.provider) {
    case "Google":
      return user.email ? { label: "Google", value: user.email } : null;
    case "Twitter": {
      const displayHandle = user.originalTwitterHandle || user.twitterHandle;
      return displayHandle ? { label: "X", value: `@${displayHandle}` } : null;
    }
    case "MetaMask":
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
    default:
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
  }
}

export interface ProfileDisplay {
  displayName: string;
  avatarUrl: string | null;
  walletAddress: string | null;
  fallbackLetter: string;
  loginIdentifier: LoginIdentifier | null;
}

export function useProfileDisplay(user: UserData | null): ProfileDisplay {
  const displayName = useMemo(() => {
    if (!user) return "User";
    // 0. Custom display name (user-set via My Account)
    if (user.customDisplayName) return user.customDisplayName;
    // 1. X (Twitter) display name
    const tw = user.linkedAccounts?.twitter;
    const xDisplayName = user.provider === "Twitter"
      ? user.username
      : tw?.username;
    if (xDisplayName) return xDisplayName;

    // 2. Google email name
    const gl = user.linkedAccounts?.google;
    const email = user.provider === "Google" ? user.email : gl?.email;
    if (email) return email.split("@")[0];

    // 3. Wallet address fallback
    if (user.walletAddress) {
      return `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
    }
    return "User";
  }, [user]);

  const avatarUrl = resolveAvatarUrl(user ?? undefined, { baseUrl: PUBLIC_AVATARS_BASE_URL });
  const walletAddress = user?.walletAddress ?? null;
  const fallbackLetter = displayName.charAt(0).toUpperCase();
  const loginIdentifier = useMemo(() => getLoginIdentifier(user), [user]);

  return { displayName, avatarUrl, walletAddress, fallbackLetter, loginIdentifier };
}
