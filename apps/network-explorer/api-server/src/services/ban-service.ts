/**
 * Ecosystem ban service.
 *
 * Shared logic for banning suspected bot accounts. Used by:
 *   - CLI: `scripts/ban-users.ts`
 *   - HTTP: `routes/ecosystem-ban.ts` (admin web UI)
 *
 * Ban semantics (idempotent):
 *   1. INSERT into banned_users (re-ban clears unbanned_at).
 *   2. UPDATE activity_points SET flagged = true WHERE identity_id = $1.
 *      Ecosystem leaderboard + settle-ecosystem already filter
 *      `WHERE NOT flagged`, so this update silently removes the user.
 *   3. POST to chat-server's banned-cache refresh so Pado leaderboard and
 *      aggregator pick up the ban within seconds (otherwise wait 5 min TTL).
 *
 * Past settled snapshots (weekly_score_snapshots, weekly_ecosystem_snapshots)
 * are intentionally NOT modified (forward-only, per
 * `feedback_no_modify_snapshots` and `feedback_points_monotonic_increase`).
 */

import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const CHAT_SERVER_URL = process.env.CHAT_SERVER_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

let _ddb: DynamoDBDocumentClient | null = null;
function getDdb(): DynamoDBDocumentClient {
  if (!_ddb) {
    _ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));
  }
  return _ddb;
}

interface UserProfileRecord {
  identityId: string;
  username?: string;
  twitterHandle?: string;
  walletAddress?: string;
}

interface LinkedAccountInfo {
  identityId?: string;
  walletAddress?: string;
}

interface FullProfile {
  identityId: string;
  walletAddress?: string;
  linkedAccounts?: Record<string, LinkedAccountInfo>;
}

export type ResolutionStatus =
  | 'mapped'
  | 'no-profile'
  | 'no-wallet'
  | 'lookup-error'
  | 'invalid-handle';

export interface Resolution {
  handle: string;
  identityId?: string;
  walletAddress?: string;
  status: ResolutionStatus;
  note?: string;
}

export function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim();
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(handle);
}

async function lookupIdentityByHandle(handle: string): Promise<string | null> {
  const result = await getDdb().send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'twitterHandle-index',
      KeyConditionExpression: 'twitterHandle = :handle',
      ExpressionAttributeValues: { ':handle': handle },
    }),
  );
  if (!result.Items || result.Items.length === 0) return null;

  let best = result.Items[0] as UserProfileRecord;
  for (const it of result.Items) {
    const p = it as UserProfileRecord;
    if (p.username && !p.username.startsWith('0x')) {
      best = p;
      break;
    }
  }
  return best.identityId;
}

/**
 * Resolve the wallet that earns ecosystem points for this user.
 *
 * X-primary signups link a separate "nasun wallet" identity that owns the
 * actual on-chain activity. We mirror disbursement-target resolution from
 * grant-creators-appreciation-bonus.ts so bans hit the identity that earns,
 * not just the X-login identity.
 */
async function resolveBanTargets(
  primaryIdentityId: string,
): Promise<Array<{ identityId: string; walletAddress?: string; source: string }>> {
  const result = await getDdb().send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: primaryIdentityId } }),
  );
  const profile = result.Item as FullProfile | undefined;
  if (!profile) {
    return [{ identityId: primaryIdentityId, source: 'primary-no-profile' }];
  }

  const targets: Array<{ identityId: string; walletAddress?: string; source: string }> = [
    {
      identityId: primaryIdentityId,
      walletAddress: profile.walletAddress?.toLowerCase(),
      source: 'primary',
    },
  ];

  const nasunLink = profile.linkedAccounts?.['nasun wallet'];
  if (nasunLink?.identityId && nasunLink.identityId !== primaryIdentityId) {
    targets.push({
      identityId: nasunLink.identityId,
      walletAddress: nasunLink.walletAddress?.toLowerCase(),
      source: 'linked-nasun-wallet',
    });
  }

  return targets;
}

/**
 * Resolve a single X handle into 1-2 ban targets (primary + linked nasun
 * wallet). Returns one Resolution per target; status = 'invalid-handle' /
 * 'no-profile' / 'lookup-error' / 'no-wallet' / 'mapped'.
 */
export async function resolveHandle(handle: string): Promise<Resolution[]> {
  if (!isValidHandle(handle)) {
    return [{ handle, status: 'invalid-handle', note: 'X handle pattern violation' }];
  }
  let primaryId: string | null;
  try {
    primaryId = await lookupIdentityByHandle(handle);
  } catch (err) {
    return [{ handle, status: 'lookup-error', note: (err as Error).message }];
  }
  if (!primaryId) {
    return [{ handle, status: 'no-profile', note: 'no UserProfiles row with this twitterHandle' }];
  }
  const targets = await resolveBanTargets(primaryId);
  return targets.map((t) => ({
    handle,
    identityId: t.identityId,
    walletAddress: t.walletAddress,
    status: t.walletAddress ? 'mapped' : 'no-wallet',
    note: t.source,
  }));
}

/**
 * Resolve a primary identityId directly (no X handle lookup). Used by the
 * admin web UI which already knows the identityId from UsersTab.
 */
export async function resolveByIdentityId(
  primaryIdentityId: string,
  handleHint?: string,
): Promise<Resolution[]> {
  let targets;
  try {
    targets = await resolveBanTargets(primaryIdentityId);
  } catch (err) {
    return [
      { handle: handleHint ?? primaryIdentityId, status: 'lookup-error', note: (err as Error).message },
    ];
  }
  return targets.map((t) => ({
    handle: handleHint ?? '',
    identityId: t.identityId,
    walletAddress: t.walletAddress,
    status: t.walletAddress ? 'mapped' : 'no-wallet',
    note: t.source,
  }));
}

export interface ApplyResult {
  identityId: string;
  walletAddress?: string;
  handle: string;
  flaggedRows: number;
  source?: string;
}

export async function applyBans(
  db: postgres.Sql,
  resolutions: Resolution[],
  reason: string,
  actor: string,
): Promise<ApplyResult[]> {
  const mapped = resolutions.filter((r) => r.identityId);
  const out: ApplyResult[] = [];

  for (const r of mapped) {
    await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db;
      // activity_points has a PG-side guard that blocks all UPDATEs by
      // default. Admin corrections bypass for this transaction only.
      await sql`SET LOCAL app.allow_points_mutation = 'on'`;
      await sql`
        INSERT INTO banned_users (identity_id, wallet_address, x_handle, reason, banned_by, unbanned_at, unbanned_by)
        VALUES (${r.identityId!}, ${r.walletAddress ?? null}, ${r.handle || null}, ${reason}, ${actor}, NULL, NULL)
        ON CONFLICT (identity_id) DO UPDATE SET
          wallet_address = COALESCE(EXCLUDED.wallet_address, banned_users.wallet_address),
          x_handle       = COALESCE(EXCLUDED.x_handle, banned_users.x_handle),
          reason         = EXCLUDED.reason,
          banned_at      = NOW(),
          banned_by      = EXCLUDED.banned_by,
          unbanned_at    = NULL,
          unbanned_by    = NULL
      `;

      const updated = await sql<Array<{ count: string }>>`
        WITH upd AS (
          UPDATE activity_points
          SET flagged = true
          WHERE identity_id = ${r.identityId!}
            AND NOT flagged
          RETURNING 1
        )
        SELECT COUNT(*)::text AS count FROM upd
      `;
      out.push({
        identityId: r.identityId!,
        walletAddress: r.walletAddress,
        handle: r.handle,
        flaggedRows: Number(updated[0]?.count ?? 0),
        source: r.note,
      });
    });
  }

  return out;
}

export interface UnbanResult {
  identityId: string;
  handle: string;
  cleared: boolean;
  unflaggedRows: number;
}

export async function applyUnbans(
  db: postgres.Sql,
  resolutions: Resolution[],
  actor: string,
  reason: string,
): Promise<UnbanResult[]> {
  const mapped = resolutions.filter((r) => r.identityId);
  const out: UnbanResult[] = [];

  for (const r of mapped) {
    await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db;
      await sql`SET LOCAL app.allow_points_mutation = 'on'`;
      const result = await sql<Array<{ identity_id: string }>>`
        UPDATE banned_users
        SET unbanned_at = NOW(),
            unbanned_by = ${actor},
            notes = COALESCE(notes || E'\n', '') || ${'unban reason: ' + reason}
        WHERE identity_id = ${r.identityId!}
          AND unbanned_at IS NULL
        RETURNING identity_id
      `;
      if (result.length === 0) {
        out.push({ identityId: r.identityId!, handle: r.handle, cleared: false, unflaggedRows: 0 });
        return;
      }
      const updated = await sql<Array<{ count: string }>>`
        WITH upd AS (
          UPDATE activity_points
          SET flagged = false
          WHERE identity_id = ${r.identityId!}
            AND flagged
          RETURNING 1
        )
        SELECT COUNT(*)::text AS count FROM upd
      `;
      out.push({
        identityId: r.identityId!,
        handle: r.handle,
        cleared: true,
        unflaggedRows: Number(updated[0]?.count ?? 0),
      });
    });
  }

  return out;
}

export async function refreshChatServerCache(): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!CHAT_SERVER_URL || !INTERNAL_API_KEY) {
    return { ok: false, error: 'CHAT_SERVER_URL or INTERNAL_API_KEY not set' };
  }
  try {
    const res = await fetch(`${CHAT_SERVER_URL}/api/pado/internal/banned-cache/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${INTERNAL_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
