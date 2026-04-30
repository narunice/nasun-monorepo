import type { EcosystemProfile } from '@nasun/profile-core';

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface FetchProfileOptions {
  /**
   * Full URL of the user-profile endpoint. The package appends
   * `?walletAddress=...` directly to this URL — pass whatever your app's
   * API Gateway / proxy path is. Example:
   *   `https://api.example.com/prod/`
   *   `https://api.example.com/v3/user-profile`
   */
  endpoint: string;
  /** Optional fetch override (for tests). */
  fetcher?: typeof fetch;
}

export class ProfileFetchError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'ProfileFetchError';
  }
}

function appendQuery(endpoint: string, query: string): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint.replace(/\/+$/, '')}${sep}${query}`;
}

/**
 * Public read of any user's profile by wallet address. No auth required.
 * Returns null when the address isn't registered (not an error).
 */
export async function fetchPublicProfile(
  walletAddress: string,
  options: FetchProfileOptions,
): Promise<EcosystemProfile | null> {
  if (!walletAddress) return null;
  if (!SUI_ADDRESS_RE.test(walletAddress) && !ETH_ADDRESS_RE.test(walletAddress)) {
    return null;
  }
  const url = appendQuery(options.endpoint, `walletAddress=${encodeURIComponent(walletAddress)}`);
  const fetcher = options.fetcher ?? fetch;
  const res = await fetcher(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ProfileFetchError(`Profile fetch failed: ${res.status}`, res.status);
  }
  const json = await res.json() as { user?: EcosystemProfile } | EcosystemProfile;
  // Some legacy responses may wrap in `{ user: ... }`; tolerate both.
  if (json && typeof json === 'object' && 'user' in (json as any)) {
    return (json as { user?: EcosystemProfile }).user ?? null;
  }
  return json as EcosystemProfile;
}
