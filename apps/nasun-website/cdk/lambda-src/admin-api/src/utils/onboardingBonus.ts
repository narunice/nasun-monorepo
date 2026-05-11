// Template helper for onboarding bonus grants. Copied into each Lambda that
// triggers a grant (link-account, auth-twitter, verify-telegram, admin-api).
// Cross-directory imports are blocked by each Lambda's tsconfig rootDir, so we
// duplicate this small file rather than introducing a workspace package.
//
// If you change this file, mirror the change in every Lambda copy:
//   apps/nasun-website/cdk/lambda-src/link-account/onboardingBonus.ts
//   apps/nasun-website/cdk/lambda-src/auth-twitter/src/utils/onboardingBonus.ts
//   apps/nasun-website/cdk/lambda-src/leaderboard-v3/src/utils/onboardingBonus.ts
//   apps/nasun-website/cdk/lambda-src/admin-api/src/utils/onboardingBonus.ts

import { GetCommand } from '@aws-sdk/lib-dynamodb';

// Structural type avoids version-mismatch errors when callers resolve
// @aws-sdk/lib-dynamodb from their own node_modules.
export interface DocClientLike {
  send(command: any): Promise<any>;
}

export type OnboardingKind =
  | 'follow-nasun'
  | 'x-link'
  | 'google-link'
  | 'telegram-link';

// Mirror of EXTERNAL_ID_REGEX in explorer-api points.ts.
const EXTERNAL_ID_REGEX: Record<OnboardingKind, RegExp> = {
  'follow-nasun': /^\d{1,25}$/,
  'x-link': /^\d{1,25}$/,
  'google-link': /^[\w-]+:[\w-]{36}$/,
  'telegram-link': /^\d{1,25}$/,
};

export type GrantResult = {
  granted: boolean;
  reason?: 'invalid-input' | 'not-referred' | 'dup' | 'http-failed';
};

export interface GrantOpts {
  ddbClient: DocClientLike;
  referralsTable: string;
  explorerApiUrl: string;
  apiKey: string;
  identityId: string;
  walletAddress?: string | null;
  kind: OnboardingKind;
  externalId: string;
}

async function isReferralActivated(
  ddbClient: DocClientLike,
  referralsTable: string,
  identityId: string,
): Promise<boolean> {
  const res = await ddbClient.send(
    new GetCommand({
      TableName: referralsTable,
      Key: { referredIdentityId: identityId },
      ProjectionExpression: '#s',
      ExpressionAttributeNames: { '#s': 'status' },
    }),
  );
  return res.Item?.status === 'ACTIVATED';
}

/**
 * Grant onboarding bonus iff the identity's referral is ACTIVATED.
 * Idempotency lives in PG (UNIQUE on tx_digest, activity_type, event_seq).
 *
 * Never throws. Callers may still wrap in .catch(non-fatal) defensively.
 */
export async function grantIfReferralActivated(
  opts: GrantOpts,
): Promise<GrantResult> {
  const { kind, externalId, identityId } = opts;

  if (!opts.apiKey) {
    // Fail-fast on misconfiguration. Without this guard the explorer-api
    // would 401-reject every call and the failure would only surface as
    // http-failed log entries.
    console.warn(
      `[onboarding-bonus] skip missing-apikey kind=${kind} id=${identityId.slice(0, 16)}...`,
    );
    return { granted: false, reason: 'http-failed' };
  }

  if (!EXTERNAL_ID_REGEX[kind].test(externalId)) {
    console.warn(
      `[onboarding-bonus] invalid-input kind=${kind} id=${identityId.slice(0, 16)}...`,
    );
    return { granted: false, reason: 'invalid-input' };
  }

  let activated = false;
  try {
    activated = await isReferralActivated(
      opts.ddbClient,
      opts.referralsTable,
      identityId,
    );
  } catch (err) {
    console.error('[onboarding-bonus] referrals-lookup failed', err);
    return { granted: false, reason: 'http-failed' };
  }
  if (!activated) {
    console.log(
      `[onboarding-bonus] skip not-referred kind=${kind} id=${identityId.slice(0, 16)}...`,
    );
    return { granted: false, reason: 'not-referred' };
  }

  try {
    const res = await fetch(
      `${opts.explorerApiUrl.replace(/\/$/, '')}/api/v1/points/onboarding-bonus`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
        },
        body: JSON.stringify({
          identityId,
          walletAddress: opts.walletAddress ?? undefined,
          kind,
          externalId,
        }),
        // Cap explorer-api latency. admin approve handler fans out up to 4
        // grants in parallel; an unbounded hang would block the approve
        // response. Lambda timeout is the next safety net (10-30s).
        signal: AbortSignal.timeout(3000),
      },
    );

    if (!res.ok) {
      console.error(
        `[onboarding-bonus] explorer-api ${res.status} kind=${kind} id=${identityId.slice(0, 16)}...`,
      );
      return { granted: false, reason: 'http-failed' };
    }

    const body = (await res.json()) as { created?: boolean };
    if (body.created) {
      console.log(
        `[onboarding-bonus] granted kind=${kind} id=${identityId.slice(0, 16)}...`,
      );
      return { granted: true };
    }
    console.log(
      `[onboarding-bonus] dup kind=${kind} id=${identityId.slice(0, 16)}...`,
    );
    return { granted: false, reason: 'dup' };
  } catch (err) {
    console.error('[onboarding-bonus] fetch failed', err);
    return { granted: false, reason: 'http-failed' };
  }
}
