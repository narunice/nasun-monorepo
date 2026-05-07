import { memo } from 'react';
import { EcosystemAvatar, resolveAvatarUrl, useProfile } from '@nasun/profile-react';

/**
 * TraderAvatar — single-source-of-truth avatar for Pado leaderboard rows.
 *
 * Resolution order:
 *   1. ecosystem profile (useProfile → resolveAvatarUrl)
 *   2. leaderboard API's profileImageUrl (already resolved server-side
 *      in chat-server, kept as a fallback while useProfile is loading)
 *   3. boring-avatars `pixel` identicon seeded by walletAddress
 *
 * Rendering and identicon variant are delegated to <EcosystemAvatar> so
 * Pado matches my-account / Nasun chat / Nasun leaderboards exactly.
 */

const PROFILE_API = (import.meta.env.VITE_NASUN_USER_PROFILE_API as string | undefined) ?? '';
const PUBLIC_AVATARS_BASE_URL =
  (import.meta.env.VITE_PUBLIC_AVATARS_BASE_URL as string | undefined) ?? '';

interface TraderAvatarProps {
  walletAddress: string;
  profileImageUrl?: string | null;
  size?: number;
}

export const TraderAvatar = memo(function TraderAvatar({
  walletAddress, profileImageUrl, size = 40,
}: TraderAvatarProps) {
  const { data: profile } = useProfile(walletAddress, {
    endpoint: PROFILE_API,
    refetchOnWindowFocus: true,
  });

  const ecosystemUrl = profile
    ? resolveAvatarUrl(profile, { baseUrl: PUBLIC_AVATARS_BASE_URL })
    : null;
  const imageUrl = ecosystemUrl ?? profileImageUrl ?? null;

  return <EcosystemAvatar seed={walletAddress || 'unknown'} imageUrl={imageUrl} size={size} />;
});
