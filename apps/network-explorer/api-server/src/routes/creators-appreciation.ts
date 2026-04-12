/**
 * Creators Appreciation Bonus — self-claim endpoints.
 *
 * One-time 60 ecosystem points bonus to Top 500 creators of
 * Community Leaderboard v3 Season 1 (snapshot 2026-04-09).
 *
 * Eligibility list bundled at src/data/creators-appreciation-eligibility.json
 * is generated from a backup snapshot via:
 *   npx tsx src/scripts/grant-creators-appreciation-bonus.ts --export-eligibility
 *
 * Idempotency: activity_points UNIQUE(tx_digest, activity_type, event_seq)
 * with tx_digest = bonus-creators-appreciation:season1:{targetIdentityId}:{handle}.
 *
 * Operational env vars:
 *   CREATORS_APPRECIATION_ENABLED=true   gate (defaults to false on missing)
 *   CREATORS_APPRECIATION_DEADLINE_ISO   ISO timestamp; defaults to 2026-04-19T00:00:00Z
 */

import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointsDb } from '../db.js';
import { invalidate as invalidateCache } from '../cache.js';
import { requireCognitoAuth, type AuthContext } from '../auth/cognito.js';

interface EligibilityEntry {
  rank: number;
  handle: string;
  originalHandle: string;
  accountId: string;
  primaryIdentityId: string;
  targetIdentityId: string;
  targetWalletAddress: string;
  walletSource: 'top-level' | 'linked-nasun-wallet';
}

interface EligibilityFile {
  bonusName: string;
  category: string;
  activityType: string;
  bonusPoints: number;
  snapshotDate: string;
  generatedAt: string;
  entries: EligibilityEntry[];
}

// Load JSON via fs (Node 20 'with { type: "json" }' is still experimental and
// can vary by tsx/Node combo; readFileSync is the boring, portable option).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ELIGIBILITY_PATH = resolve(__dirname, '../data/creators-appreciation-eligibility.json');
const ELIGIBILITY = JSON.parse(readFileSync(ELIGIBILITY_PATH, 'utf-8')) as EligibilityFile;

const ENABLED = process.env.CREATORS_APPRECIATION_ENABLED === 'true';
const CLAIM_DEADLINE_ISO =
  process.env.CREATORS_APPRECIATION_DEADLINE_ISO || '2026-04-19T00:00:00Z';
const CLAIM_DEADLINE_MS = Date.parse(CLAIM_DEADLINE_ISO);

if (Number.isNaN(CLAIM_DEADLINE_MS)) {
  throw new Error(
    `[creators-appreciation] Invalid CREATORS_APPRECIATION_DEADLINE_ISO: ${CLAIM_DEADLINE_ISO}`,
  );
}

console.log(
  `[creators-appreciation] enabled=${ENABLED} deadline=${CLAIM_DEADLINE_ISO} ` +
  `entries=${ELIGIBILITY.entries.length}`,
);

// Index by both primaryIdentityId (the X-linked Cognito identity) and
// targetIdentityId (the linked Nasun-wallet identity, when different).
// nasun-website signs users in via their Nasun wallet, so the JWT `sub`
// will be the target identity for anyone whose X handle is linked to a
// separate wallet. Those users would otherwise miss lookup entirely.
const BY_IDENTITY = new Map<string, EligibilityEntry>();
for (const e of ELIGIBILITY.entries) {
  BY_IDENTITY.set(e.primaryIdentityId, e);
  if (e.targetIdentityId !== e.primaryIdentityId) {
    BY_IDENTITY.set(e.targetIdentityId, e);
  }
}

function txDigestFor(entry: EligibilityEntry): string {
  return `bonus-creators-appreciation:season1:${entry.targetIdentityId}:${entry.handle}`;
}

type Variables = { auth: AuthContext };

const app = new Hono<{ Variables: Variables }>();

app.use('*', requireCognitoAuth);

/**
 * GET /v1/creators-appreciation/status
 *
 * Returns the claim status for the calling user.
 * For ineligible users returns `eligible: false` (no other detail).
 */
app.get('/status', async (c) => {
  const auth = c.get('auth');

  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const entry = BY_IDENTITY.get(auth.identityId);
  const baseResponse = {
    bonusName: ELIGIBILITY.bonusName,
    bonusPoints: ELIGIBILITY.bonusPoints,
    claimDeadline: CLAIM_DEADLINE_ISO,
    expired: Date.now() >= CLAIM_DEADLINE_MS,
    enabled: ENABLED,
  };

  if (!entry) {
    return c.json({ ...baseResponse, eligible: false, claimed: false });
  }

  try {
    const digest = txDigestFor(entry);
    const rows = await pointsDb<{ processed_at: string }[]>`
      SELECT processed_at FROM activity_points
      WHERE tx_digest = ${digest}
        AND activity_type = ${ELIGIBILITY.activityType}
        AND event_seq = 0
      LIMIT 1
    `;
    return c.json({
      ...baseResponse,
      eligible: true,
      rank: entry.rank,
      handle: entry.originalHandle,
      claimed: rows.length > 0,
      claimedAt: rows[0]?.processed_at ?? null,
    });
  } catch (err) {
    console.error('[creators-appreciation] /status db error:', err);
    return c.json({ error: 'db_error' }, 503);
  }
});

/**
 * POST /v1/creators-appreciation/claim
 *
 * Idempotent claim: inserts +60 ecosystem points for the user's
 * disbursement target identity. Returns success even if already claimed.
 */
app.post('/claim', async (c) => {
  const auth = c.get('auth');

  if (!ENABLED) {
    return c.json({ error: 'feature_disabled' }, 503);
  }

  const entry = BY_IDENTITY.get(auth.identityId);
  if (!entry) {
    return c.json({ error: 'not_eligible' }, 403);
  }

  if (Date.now() >= CLAIM_DEADLINE_MS) {
    return c.json({ error: 'claim_window_closed', deadline: CLAIM_DEADLINE_ISO }, 410);
  }

  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const digest = txDigestFor(entry);
  try {
    // tx_timestamp = NOW() so the bonus shows up in the user's "today"
    // bucket on the day they claim. The Season 1 snapshot date is preserved
    // in the category / activity_type for reporting.
    const result = await pointsDb`
      INSERT INTO activity_points (
        tx_digest, tx_sequence_number, tx_timestamp,
        wallet_address, identity_id,
        category, activity_type,
        base_points, volume_tier, genesis_multiplier, final_points,
        event_seq
      ) VALUES (
        ${digest}, 0, NOW()::timestamptz,
        ${entry.targetWalletAddress}, ${entry.targetIdentityId},
        ${ELIGIBILITY.category}, ${ELIGIBILITY.activityType},
        ${ELIGIBILITY.bonusPoints}, 1.0, 1.0, ${ELIGIBILITY.bonusPoints},
        0
      )
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    const created = result.count > 0;

    // Evict the 30s in-memory ecosystem-score cache for this identity
    // so the very next GET /ecosystem/score/:id recomputes and reflects
    // the +60 bonus, instead of returning the pre-claim snapshot that
    // was cached up to 30s before the claim.
    if (created) {
      invalidateCache(`eco-score-${entry.targetIdentityId}`);
    }

    console.log(
      `[creators-appreciation] claim primary=${auth.identityId} ` +
      `target=${entry.targetIdentityId} handle=${entry.handle} rank=${entry.rank} ` +
      `${created ? 'INSERTED' : 'duplicate'}`,
    );
    return c.json({
      success: true,
      created,
      bonusPoints: ELIGIBILITY.bonusPoints,
      rank: entry.rank,
      handle: entry.originalHandle,
    });
  } catch (err) {
    console.error('[creators-appreciation] /claim db error:', err);
    return c.json({ error: 'db_error' }, 503);
  }
});

export default app;
