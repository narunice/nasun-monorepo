import { memo } from 'react';
import {
  EcosystemAvatar,
  resolveAvatarUrl,
  useProfile,
} from '@nasun/profile-react';
import { shortWallet } from '../dashboard/format';

const PROFILE_API =
  (import.meta.env.VITE_NASUN_USER_PROFILE_API as string | undefined) ?? '';
const PUBLIC_AVATARS_BASE_URL =
  (import.meta.env.VITE_PUBLIC_AVATARS_BASE_URL as string | undefined) ?? '';

// gostop 백엔드 visibility-mask.ts 의 mask prefix와 정확히 일치해야 함.
// LeaderboardPage 의 기존 MASK_PREFIX = '~' 는 stale state — 백엔드는 실제로
// 'anon_' + sha256(...).slice(0,10) 형태를 출력하므로 'anon_' prefix가 옳다.
const ANON_PREFIX = 'anon_';

export function isAnonymousMask(p: string): boolean {
  return p.startsWith(ANON_PREFIX);
}

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,50}$/;
function isValidXHandle(h: string | null | undefined): h is string {
  return !!h && X_HANDLE_RE.test(h);
}

interface PlayerIdentityProps {
  /** Full wallet (0x... 64hex) OR anonymous mask id ('anon_xxxxxxxxxx'). */
  player: string;
  /** Highlight as the viewer's own row. */
  isMe?: boolean;
  /** Compact layout: no secondary truncated-wallet line under the display name. */
  dense?: boolean;
}

export const PlayerIdentity = memo(function PlayerIdentity({
  player,
  isMe,
  dense,
}: PlayerIdentityProps) {
  const anon = isAnonymousMask(player);

  // Anonymous rows must never round-trip to the public profile API. Passing
  // null disables the query entirely (no react-query cache slot created).
  // fetchPublicProfile's SUI/ETH regex guard is a second line of defense only.
  const { data: profile } = useProfile(anon ? null : player, {
    endpoint: PROFILE_API,
    refetchOnWindowFocus: false,
    staleTime: 30 * 60_000,
  });

  const ecosystemAvatarUrl = profile
    ? resolveAvatarUrl(profile, { baseUrl: PUBLIC_AVATARS_BASE_URL })
    : null;
  const xHandle = profile?.twitterHandle ?? null;

  // Primary line falls back through: display name -> truncated wallet ->
  // mask id (anon rows render the mask id as-is, never the real wallet).
  const primary = anon
    ? player
    : profile?.resolvedDisplayName ?? shortWallet(player);
  // When the user has a display name, surface the truncated wallet as a
  // secondary monospace line so the row remains identifiable on-chain.
  const secondary =
    !anon && !dense && profile?.resolvedDisplayName
      ? shortWallet(player)
      : null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <EcosystemAvatar
        seed={player || 'unknown'}
        imageUrl={ecosystemAvatarUrl}
        size={28}
      />
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`text-sm font-medium truncate ${
              anon ? 'text-neutral-300' : 'text-neutral-100'
            }`}
          >
            {primary}
          </span>
          {!anon && isValidXHandle(xHandle) && (
            <a
              href={`https://x.com/${xHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`@${xHandle} on X`}
              aria-label={`Open @${xHandle} on X`}
              className="shrink-0 text-neutral-400 hover:text-gold-200 transition-colors"
            >
              <XGlyph />
            </a>
          )}
          {isMe && (
            <span className="ml-1 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-gold-400/15 text-gold-200 border border-gold-subtle shrink-0">
              You
            </span>
          )}
        </div>
        {secondary && (
          <span className="text-xs font-mono text-neutral-400 truncate">
            {secondary}
          </span>
        )}
      </div>
    </div>
  );
});

// 12x12 X mark; matches the visual weight Pado gets from react-icons FaXTwitter
// without adding a new dependency to the gostop bundle.
function XGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}
