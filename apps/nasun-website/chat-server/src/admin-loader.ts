/**
 * Admin wallet/identity exclusion list for leaderboards.
 *
 * Source of truth is `UserProfiles.role === 'ADMIN'`, but to keep chat-server
 * free of an extra DDB Scan we read a hand-curated list from env vars at
 * startup. Update both vars when adding/removing an admin:
 *
 *   ADMIN_WALLET_ADDRESSES   comma-separated 0x... wallet addresses
 *   ADMIN_IDENTITY_IDS       comma-separated Cognito identityIds (region:uuid)
 */

function parseList(raw: string | undefined, lower: boolean): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (lower ? s.toLowerCase() : s)),
  );
}

const adminAddresses = parseList(process.env.ADMIN_WALLET_ADDRESSES, true);
const adminIdentityIds = parseList(process.env.ADMIN_IDENTITY_IDS, false);

if (adminAddresses.size > 0 || adminIdentityIds.size > 0) {
  console.log(
    `[admin-loader] excluding ${adminAddresses.size} wallet(s) and ${adminIdentityIds.size} identity(ies) from leaderboards`,
  );
}

export function getAdminAddresses(): Set<string> {
  return adminAddresses;
}

export function getAdminIdentityIds(): Set<string> {
  return adminIdentityIds;
}
