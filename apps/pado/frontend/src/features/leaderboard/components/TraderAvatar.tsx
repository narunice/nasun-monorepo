import { memo, useEffect, useState } from 'react';
import Avatar from 'boring-avatars';
import { resolveAvatarUrl, useProfile } from '@nasun/profile-react';

/**
 * TraderAvatar — renders the ecosystem profile avatar (single source of truth:
 * nasun-website Lambda) when available, falling back to the leaderboard API's
 * profileImageUrl while useProfile is pending, and finally to the same
 * boring-avatars `beam` identicon used across the ecosystem (nasun-website
 * ProfileIdentityBlock, my-account, uju Profile) for visual consistency.
 */

const PROFILE_API = (import.meta.env.VITE_NASUN_USER_PROFILE_API as string | undefined) ?? '';
const PUBLIC_AVATARS_BASE_URL =
  (import.meta.env.VITE_PUBLIC_AVATARS_BASE_URL as string | undefined) ?? '';

interface TraderAvatarProps {
  /** Canonical key. Drives ecosystem profile lookup. */
  walletAddress: string;
  /** Fallback avatar from the leaderboard API; used while useProfile is loading. */
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

  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [imageUrl]);

  if (imageUrl && !errored) {
    return (
      <img
        key={`${walletAddress}|${imageUrl}`}
        src={imageUrl}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        onError={() => setErrored(true)}
        referrerPolicy="no-referrer"
        className="rounded-lg object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-lg overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      <Avatar name={walletAddress || 'unknown'} variant="beam" size={size} />
    </div>
  );
});
