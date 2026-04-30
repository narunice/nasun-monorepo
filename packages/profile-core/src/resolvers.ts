import type { EcosystemProfile, ProfileSource } from './types.js';

const WALLET_SHORT_HEAD = 6;
const WALLET_SHORT_TAIL = 4;

function shortenWallet(addr: string): string {
  if (addr.length <= WALLET_SHORT_HEAD + WALLET_SHORT_TAIL + 2) return addr;
  return `${addr.slice(0, WALLET_SHORT_HEAD)}...${addr.slice(-WALLET_SHORT_TAIL)}`;
}

/**
 * Display-name cascade used everywhere in the ecosystem.
 *
 * Priority:
 *   1. customDisplayName (user-set; ecosystem SoT)
 *   2. Twitter username (from linkedAccounts or root provider field)
 *   3. Google email local part
 *   4. Shortened wallet address
 *   5. 'User' (last resort)
 */
export function resolveDisplayName(p: EcosystemProfile | null | undefined): {
  name: string;
  source: ProfileSource;
} {
  if (!p) return { name: 'User', source: 'wallet' };

  if (p.customDisplayName) {
    return { name: p.customDisplayName, source: 'custom' };
  }

  // Twitter — prefer originalTwitterHandle (case-preserving), fall back
  const twHandle =
    p.linkedAccounts?.twitter?.originalTwitterHandle ??
    p.linkedAccounts?.twitter?.twitterHandle ??
    p.linkedAccounts?.twitter?.username ??
    (p.provider === 'Twitter'
      ? p.originalTwitterHandle ?? p.twitterHandle ?? p.username
      : undefined);
  if (twHandle) return { name: twHandle, source: 'twitter' };

  // Google — email local part
  const gEmail =
    p.linkedAccounts?.google?.email ??
    (p.provider === 'Google' ? p.email : undefined);
  if (gEmail) {
    const localPart = gEmail.split('@')[0];
    if (localPart) return { name: localPart, source: 'google' };
  }

  // Wallet
  if (p.walletAddress) return { name: shortenWallet(p.walletAddress), source: 'wallet' };

  return { name: 'User', source: 'wallet' };
}

/**
 * Compose a fully-qualified avatar URL from a stored S3 key.
 * Returns null when key is empty/null.
 *
 * `baseUrl` should be the consuming app's environment variable
 * (PUBLIC_AVATARS_BASE_URL) — typically the S3 bucket HTTPS URL or, in the
 * future, a CloudFront distribution domain.
 */
export function buildAvatarUrlFromKey(
  key: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!key) return null;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanKey = key.replace(/^\/+/, '');
  return `${cleanBase}/${cleanKey}`;
}

/**
 * Avatar URL cascade.
 *
 * Priority:
 *   1. customAvatarKey (user-uploaded; resolved via baseUrl)
 *   2. Linked Twitter profile image
 *   3. Linked Google profile image
 *   4. null (consumer renders identicon from wallet address)
 *
 * Notes:
 *   - We intentionally DO NOT fall back to the legacy root `profileImageUrl`
 *     field. After a social account is unlinked, that root field can hold a
 *     stale URL whose CDN tokens are revoked. Only `linkedAccounts.<provider>.
 *     profileImageUrl` is trusted.
 *   - When `customAvatarBanned` is true, customAvatarKey is treated as null
 *     and the cascade falls through to the next source.
 */
export function resolveAvatarUrl(
  p: EcosystemProfile | null | undefined,
  opts: { baseUrl: string },
): string | null {
  if (!p) return null;

  if (p.customAvatarKey && !p.customAvatarBanned) {
    return buildAvatarUrlFromKey(p.customAvatarKey, opts.baseUrl);
  }

  const tw = p.linkedAccounts?.twitter?.profileImageUrl;
  if (tw) return tw;

  const gl = p.linkedAccounts?.google?.profileImageUrl;
  if (gl) return gl;

  return null;
}
