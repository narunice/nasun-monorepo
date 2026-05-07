import { memo, useState } from 'react';
import Avatar from 'boring-avatars';

// Session-scoped blacklist for failed image URLs. Cleared on page reload.
// Sharing this across all <EcosystemAvatar> instances avoids re-fetching
// known-broken URLs (revoked Twitter CDN tokens, deleted S3 keys, etc.).
const failedUrls = new Set<string>();

export interface EcosystemAvatarProps {
  /** Seed for the identicon fallback. Must be stable per user — use the
   *  user's wallet address (lowercase). */
  seed: string;
  /** Pre-resolved avatar URL. When set and reachable, rendered as an <img>;
   *  otherwise the identicon fallback is shown. Pass the output of
   *  resolveAvatarUrl(profile, { baseUrl }) or a backend-resolved URL. */
  imageUrl?: string | null;
  size?: number;
  /** Square corners (recommended for pixel variant). */
  square?: boolean;
  className?: string;
}

/**
 * Single source of truth for ecosystem-wide user avatars.
 *
 * Renders, in order:
 *   1. The `imageUrl` as a regular <img> when set and reachable.
 *   2. A boring-avatars `pixel` identicon seeded by `seed` as fallback.
 *
 * The pixel variant is the canonical Nasun identicon style — chosen so the
 * fallback in chat / leaderboards / my-account all look the same. Do not pick
 * other variants (beam, marble, etc.) on a per-screen basis; that defeats the
 * unification goal.
 *
 * Image-load failures are cached per session via `failedUrls`, so a single
 * 404 / 403 response immediately falls through to the identicon for every
 * subsequent render of the same URL.
 */
export const EcosystemAvatar = memo(function EcosystemAvatar({
  seed,
  imageUrl,
  size = 32,
  square = true,
  className,
}: EcosystemAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!imageUrl && !imgError && !failedUrls.has(imageUrl);

  const radiusClass = square ? 'rounded-md' : 'rounded-full';
  const wrapperClass = `shrink-0 overflow-hidden ${radiusClass} ${className ?? ''}`.trim();

  if (showImage) {
    return (
      <img
        src={imageUrl as string}
        alt=""
        width={size}
        height={size}
        className={`${wrapperClass} object-cover`}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => {
          failedUrls.add(imageUrl as string);
          setImgError(true);
        }}
      />
    );
  }

  return (
    <div className={wrapperClass} style={{ width: size, height: size }}>
      <Avatar name={seed} variant="pixel" size={size} square={square} />
    </div>
  );
});
