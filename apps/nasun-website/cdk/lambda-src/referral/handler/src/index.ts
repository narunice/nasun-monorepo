/**
 * Referral System Handler Lambda
 *
 * GET  /referral/my-code  - Get or generate referral code (lazy generation)
 * POST /referral/apply    - Apply a referral code
 * GET  /referral/my-stats - Get referral statistics and invitee list
 *
 * Security:
 * - JWT authorizer injects identityId into requestContext
 * - Self-referral blocked via collectLinkedIdentityIds()
 * - Atomic PutItem with ConditionExpression prevents duplicate referrals
 * - Referral code generation with collision retry (max 3 attempts)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";
import {
  evaluateGate,
  type EligibilitySignals,
  type GateDecision,
} from "./eligibility.js";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const REFERRAL_CODES_TABLE = process.env.REFERRAL_CODES_TABLE_NAME;
const REFERRALS_TABLE = process.env.REFERRALS_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
const REFERRAL_STATS_API_URL = process.env.REFERRAL_STATS_API_URL || "";
const REFERRAL_STATS_API_KEY = process.env.REFERRAL_STATS_API_KEY || "";
const REFERRAL_ELIGIBILITY_API_URL = process.env.REFERRAL_ELIGIBILITY_API_URL || "";
const REFERRAL_ELIGIBILITY_API_KEY = process.env.REFERRAL_ELIGIBILITY_API_KEY || "";
const REFERRAL_GATE_ENABLED = process.env.REFERRAL_GATE_ENABLED !== "false";

// ==================== CloudWatch EMF metrics ====================
// CloudWatch automatically extracts metrics from log lines in this format —
// no SDK call, no IAM permission beyond default Lambda log access.

const METRIC_NAMESPACE = "Nasun/Referral";

function emitMetric(
  metricName: "ReferralCodeIssued" | "ReferralCodeRejected" | "ReferralEligibilityPending" | "ReferralEligibilityOutage",
  dimensions: Record<string, string> = {},
): void {
  const dimensionNames = Object.keys(dimensions);
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: METRIC_NAMESPACE,
          Dimensions: dimensionNames.length > 0 ? [dimensionNames] : [[]],
          Metrics: [{ Name: metricName, Unit: "Count" }],
        },
      ],
    },
    ...dimensions,
    [metricName]: 1,
  };
  console.log(JSON.stringify(payload));
}

if (!REFERRAL_CODES_TABLE || !REFERRALS_TABLE || !USER_PROFILES_TABLE) {
  throw new Error(
    "REFERRAL_CODES_TABLE_NAME, REFERRALS_TABLE_NAME, and USER_PROFILES_TABLE_NAME are required"
  );
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io")
  .split(",")
  .map((o) => o.trim());

const MAX_REFERRALS_PER_USER = 100;
const CODE_GENERATION_MAX_RETRIES = 3;
const DECLINE_COOLDOWN_DAYS = 30;
const REFEREES_INLINE_PAGE_SIZE = 20;
const REFEREES_MAX_PAGE_SIZE = 100;

// --- Response helpers ---

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
  origin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

// --- Shared utilities ---

/**
 * Collect all identityIds associated with a user (self + primary + all linked accounts).
 * Reuses the same pattern as genesis-pass register Lambda.
 */
function collectLinkedIdentityIds(
  identityId: string,
  profile?: Record<string, any>
): string[] {
  const ids = new Set<string>([identityId]);
  if (!profile) return [...ids];

  if (profile.linkedToPrimaryId) {
    ids.add(profile.linkedToPrimaryId);
  }

  if (profile.linkedAccounts) {
    for (const account of Object.values(profile.linkedAccounts) as any[]) {
      if (account?.identityId) ids.add(account.identityId);
    }
  }

  return [...ids];
}

/**
 * Generate a cryptographic random 8-character alphanumeric code (A-Z, 0-9).
 * Uses base-36 encoding for ~41 bits of entropy (36^8 = 2.8 trillion possibilities).
 */
function generateReferralCode(): string {
  return randomBytes(5)
    .readUIntBE(0, 5)
    .toString(36)
    .toUpperCase()
    .padStart(8, "0")
    .slice(0, 8);
}

// ==================== Eligibility helpers ====================

async function fetchEligibilitySignals(
  identityId: string
): Promise<EligibilitySignals | { error: "pending" } | { error: "outage" }> {
  if (!REFERRAL_ELIGIBILITY_API_URL || !REFERRAL_ELIGIBILITY_API_KEY) {
    console.error("[referral] Eligibility API not configured");
    return { error: "outage" };
  }

  const url = `${REFERRAL_ELIGIBILITY_API_URL.replace(/\/$/, "")}/${encodeURIComponent(identityId)}`;
  const headers = { "x-api-key": REFERRAL_ELIGIBILITY_API_KEY };

  // 5s timeout, 1 retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 503) {
        return { error: "pending" };
      }
      if (!res.ok) {
        if (attempt === 1) return { error: "outage" };
        continue;
      }
      const data = (await res.json()) as EligibilitySignals;
      if (!data.activationsCacheReady) {
        // GP cache cold; treat as pending so caller can retry shortly
        return { error: "pending" };
      }
      return data;
    } catch (err) {
      if (attempt === 1) {
        console.warn("[referral] Eligibility fetch failed:", err);
        return { error: "outage" };
      }
    }
  }
  return { error: "outage" };
}

// ==================== GET /referral/my-code ====================

async function handleMyCode(
  identityId: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // 1. Load profile (referralCode + social fields)
  const profile = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression:
        "referralCode, twitterHandle, provider, isTelegramMember, linkedAccounts",
    })
  );

  if (profile.Item?.referralCode) {
    return jsonResponse(200, { referralCode: profile.Item.referralCode }, origin);
  }

  // 1.5. Eligibility gate (skip if disabled by env toggle)
  if (REFERRAL_GATE_ENABLED) {
    const signals = await fetchEligibilitySignals(identityId);
    if ("error" in signals) {
      if (signals.error === "pending") {
        emitMetric("ReferralEligibilityPending");
        return jsonResponse(
          503,
          {
            error: "ELIGIBILITY_PENDING",
            message: "Eligibility check is warming up. Please retry shortly.",
          },
          origin
        );
      }
      // outage: fail-closed (do not issue codes when gate cannot be verified)
      emitMetric("ReferralEligibilityOutage");
      return jsonResponse(
        500,
        {
          error: "ELIGIBILITY_UNAVAILABLE",
          message: "Eligibility service temporarily unavailable. Please try again later.",
        },
        origin
      );
    }

    const decision = evaluateGate(profile.Item, signals);
    console.log(
      `[referral] Gate check ${identityId.slice(0, 16)}...: ` +
        `eligible=${decision.eligible} path=${decision.passedPath || decision.closestPath} ` +
        `bonus=${signals.adminCuratedBonusTotal} gov=${signals.hasGovernanceVote} gp=${signals.hasGenesisPass}`
    );
    if (!decision.eligible) {
      emitMetric("ReferralCodeRejected", {
        closestPath: decision.closestPath || "unknown",
      });
      return jsonResponse(
        403,
        {
          error: "NOT_ELIGIBLE",
          message:
            "You do not yet qualify for a referral code. See the eligibility criteria.",
          closestPath: decision.closestPath,
          hint: decision.hint,
          adminCuratedBonusTotal: signals.adminCuratedBonusTotal,
        },
        origin
      );
    }

    // Reach here only when gate passes; tag issuance with which path won.
    emitMetric("ReferralCodeIssued", {
      passedPath: decision.passedPath || "unknown",
    });
  } else {
    emitMetric("ReferralCodeIssued", { passedPath: "gate-disabled" });
  }

  // 2. Generate new code with collision retry
  for (let attempt = 0; attempt < CODE_GENERATION_MAX_RETRIES; attempt++) {
    const code = generateReferralCode();

    try {
      // Atomic insert into referral-codes table
      await client.send(
        new PutCommand({
          TableName: REFERRAL_CODES_TABLE,
          Item: {
            referralCode: code,
            identityId,
            createdAt: new Date().toISOString(),
          },
          ConditionExpression: "attribute_not_exists(referralCode)",
        })
      );

      // Store code in UserProfiles for quick lookup
      await client.send(
        new UpdateCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId },
          UpdateExpression: "SET referralCode = :code",
          ExpressionAttributeValues: { ":code": code },
        })
      );

      console.log(`[referral] Generated code ${code} for ${identityId}`);
      return jsonResponse(200, { referralCode: code }, origin);
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        console.warn(`[referral] Code collision on attempt ${attempt + 1}, retrying`);
        continue;
      }
      throw err;
    }
  }

  console.error(`[referral] Failed to generate unique code after ${CODE_GENERATION_MAX_RETRIES} attempts`);
  return jsonResponse(500, { error: "GENERATION_FAILED", message: "Failed to generate referral code" }, origin);
}

// ==================== POST /referral/apply ====================

async function handleApply(
  identityId: string,
  body: string | null,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // 1. Parse referral code from body
  let referralCode: string;
  try {
    const parsed = JSON.parse(body || "{}");
    referralCode = (parsed.referralCode || "").trim().toUpperCase();
  } catch {
    return jsonResponse(400, { error: "INVALID_BODY", message: "Invalid request body" }, origin);
  }

  if (!referralCode || (referralCode.length !== 6 && referralCode.length !== 8)) {
    return jsonResponse(400, { error: "INVALID_CODE", message: "Invalid referral code format" }, origin);
  }

  // 2. Look up referral code -> referrerIdentityId
  const codeResult = await client.send(
    new GetCommand({
      TableName: REFERRAL_CODES_TABLE,
      Key: { referralCode },
    })
  );

  if (!codeResult.Item) {
    return jsonResponse(404, { error: "CODE_NOT_FOUND", message: "Invalid referral code" }, origin);
  }

  const referrerIdentityId = codeResult.Item.identityId;

  // 3. Self-referral check (including linked accounts)
  const callerProfile = await client.send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId } })
  );

  const allCallerIds = collectLinkedIdentityIds(identityId, callerProfile.Item);
  if (allCallerIds.includes(referrerIdentityId)) {
    return jsonResponse(400, { error: "SELF_REFERRAL", message: "Cannot use your own referral code" }, origin);
  }

  // 3.5. Decline cooldown: a previously declined user cannot re-apply within
  // 30 days. Check ALL linked identities (mirrors the self-referral pattern
  // above) so a user can't sidestep cooldown by logging in via a linked
  // Google/X/MetaMask identity. Take max(lastReferralDeclinedAt) across them.
  const otherCallerIds = allCallerIds.filter((id) => id !== identityId);
  const linkedProfiles = otherCallerIds.length
    ? await Promise.all(
        otherCallerIds.map((id) =>
          client.send(
            new GetCommand({
              TableName: USER_PROFILES_TABLE,
              Key: { identityId: id },
              ProjectionExpression: "lastReferralDeclinedAt",
            })
          ).catch(() => ({ Item: undefined as Record<string, any> | undefined }))
        )
      )
    : [];
  let latestDeclinedMs = 0;
  const ownDeclined = callerProfile.Item?.lastReferralDeclinedAt as string | undefined;
  if (ownDeclined) latestDeclinedMs = Math.max(latestDeclinedMs, Date.parse(ownDeclined) || 0);
  for (const p of linkedProfiles) {
    const v = p.Item?.lastReferralDeclinedAt as string | undefined;
    if (v) latestDeclinedMs = Math.max(latestDeclinedMs, Date.parse(v) || 0);
  }
  if (latestDeclinedMs > 0) {
    const cooldownMs = DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - latestDeclinedMs < cooldownMs) {
      return jsonResponse(403, {
        error: "RECENTLY_DECLINED",
        message: "Your previous referral was declined. You can re-apply later.",
        retryAt: new Date(latestDeclinedMs + cooldownMs).toISOString(),
      }, origin);
    }
  }

  // 3.7. Twitter reuse guard: an X account that has ever been linked to a
  // different (non-self) profile cannot be used for a referral signup. Defense
  // in depth against the bot pattern of recycling one X account across many
  // wallets. link-account also enforces uniqueness upstream; this is a
  // backstop for any pre-existing duplicate state.
  const callerTwitterId = callerProfile.Item?.twitterId as string | undefined;
  if (callerTwitterId) {
    try {
      const twitterDupResult = await client.send(
        new QueryCommand({
          TableName: USER_PROFILES_TABLE,
          IndexName: "twitterId-index",
          KeyConditionExpression: "twitterId = :tid",
          ExpressionAttributeValues: { ":tid": callerTwitterId },
          ProjectionExpression: "identityId",
        })
      );
      const callerSelfIds = new Set(allCallerIds);
      const foreignOwner = (twitterDupResult.Items || []).find(
        (it) => !callerSelfIds.has(it.identityId as string)
      );
      if (foreignOwner) {
        console.warn(
          `[referral] TWITTER_REUSED identityId=${identityId} twitterId=${callerTwitterId} foreign=${foreignOwner.identityId}`
        );
        return jsonResponse(409, {
          error: "TWITTER_REUSED",
          message:
            "Your X account is already linked to another wallet. Referral signup requires a fresh X account.",
        }, origin);
      }
    } catch (err) {
      console.error("[referral] twitterId uniqueness query failed:", err);
      return jsonResponse(503, {
        error: "VERIFICATION_UNAVAILABLE",
        message: "Could not verify account eligibility. Please try again.",
      }, origin);
    }
  }

  // 4. Check referrer's existing referral count (max 100)
  const referrerCount = await client.send(
    new QueryCommand({
      TableName: REFERRALS_TABLE,
      IndexName: "referrerIdentityId-index",
      KeyConditionExpression: "referrerIdentityId = :rid",
      ExpressionAttributeValues: { ":rid": referrerIdentityId },
      Select: "COUNT",
    })
  );

  if ((referrerCount.Count || 0) >= MAX_REFERRALS_PER_USER) {
    return jsonResponse(400, {
      error: "REFERRER_LIMIT_REACHED",
      message: "This referrer has reached their maximum referral limit",
    }, origin);
  }

  // 5. Atomic insert (PK uniqueness ensures 1 referral per user)
  try {
    await client.send(
      new PutCommand({
        TableName: REFERRALS_TABLE,
        Item: {
          referredIdentityId: identityId,
          referrerIdentityId,
          referralCode,
          appliedAt: new Date().toISOString(),
          activatedAt: null,
          status: "PENDING",
        },
        ConditionExpression: "attribute_not_exists(referredIdentityId)",
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, {
        error: "ALREADY_APPLIED",
        message: "You have already applied a referral code",
      }, origin);
    }
    throw err;
  }

  console.log(`[referral] ${identityId} applied code ${referralCode} (referrer: ${referrerIdentityId})`);
  return jsonResponse(200, { success: true }, origin);
}

// ==================== Referee enrichment ====================

interface RefereeRow {
  // No identifying info (identityId, twitterHandle) is exposed to the
  // referrer. They get only what they need to track their bonus pipeline:
  // a stable serial (chronological order, oldest=1; survives new signups
  // and never reshuffles existing rows), the apply date, whether the user
  // linked X (gates admin approval), and the activation status.
  serial: number;
  twitterLinked: boolean;
  status: string;
  appliedAt: string;
  activatedAt: string | null;
}

/**
 * Enrich raw referral rows with twitterLinked status from UserProfiles.
 * Each input row must carry a precomputed `_serial` (chronological order
 * across the full referrer list — not the page slice — so it stays stable
 * as new referees join). Caller assigns serials before slicing for
 * pagination so older referees keep the same serial forever.
 *
 * Single BatchGetCommand (DDB caps at 100 keys); referrer is capped at
 * MAX_REFERRALS_PER_USER=100 so one batch covers any single page request.
 * UnprocessedKeys retried once.
 *
 * twitterHandle is intentionally NOT fetched: exposing it to the referrer
 * lets them build a permanent identity map from a single referral link
 * click. Only the boolean linked/unlinked is returned (gates admin review).
 */
async function enrichReferees(
  rawItems: Array<Record<string, any> & { _serial: number }>
): Promise<RefereeRow[]> {
  if (rawItems.length === 0) return [];
  const ids = [...new Set(rawItems.map((r) => r.referredIdentityId).filter(Boolean))];
  const linkedSet = new Set<string>();

  let keys = ids.map((id) => ({ identityId: id }));
  for (let attempt = 0; attempt < 2 && keys.length > 0; attempt++) {
    try {
      const res = await client.send(
        new BatchGetCommand({
          RequestItems: {
            [USER_PROFILES_TABLE!]: {
              Keys: keys,
              // Project ONLY twitterId (and the key). twitterHandle is
              // intentionally not requested to avoid accidental exposure.
              ProjectionExpression: "identityId, twitterId",
            },
          },
        })
      );
      const items = res.Responses?.[USER_PROFILES_TABLE!] || [];
      for (const it of items) {
        if (it.twitterId) linkedSet.add(it.identityId as string);
      }
      const unprocessed = res.UnprocessedKeys?.[USER_PROFILES_TABLE!]?.Keys as
        | Array<{ identityId: string }>
        | undefined;
      keys = unprocessed || [];
    } catch (err) {
      // Don't silently mask: log and move on with whatever we got.
      console.warn("[referral] BatchGet UserProfiles failed:", err);
      break;
    }
  }

  return rawItems.map((item) => ({
    serial: item._serial,
    twitterLinked: linkedSet.has(item.referredIdentityId),
    status: item.status,
    appliedAt: item.appliedAt,
    activatedAt: item.activatedAt || null,
  }));
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, offset })).toString("base64");
}

function decodeOffsetCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (parsed?.v !== 1 || typeof parsed.offset !== "number") return null;
    if (parsed.offset < 0 || !Number.isInteger(parsed.offset)) return null;
    return parsed.offset;
  } catch {
    return null;
  }
}

// ==================== GET /referral/my-stats ====================

async function handleMyStats(
  identityId: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // 1. Get my referral code
  const profile = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression: "referralCode",
    })
  );

  const referralCode = profile.Item?.referralCode || null;

  // 2. Get my referrals (people I invited)
  let referrals: Array<{
    status: string;
    appliedAt: string;
    activatedAt: string | null;
  }> = [];
  let sortedRawReferrals: Array<Record<string, any>> = [];

  if (referralCode) {
    const result = await client.send(
      new QueryCommand({
        TableName: REFERRALS_TABLE,
        IndexName: "referrerIdentityId-index",
        KeyConditionExpression: "referrerIdentityId = :id",
        ExpressionAttributeValues: { ":id": identityId },
      })
    );

    // GSI has no sort key. Sort by appliedAt ASC first to assign stable
    // chronological serials (oldest=1) — these never reshuffle as new
    // referees join — then sort DESC for newest-first display.
    const ascending = (result.Items || []).slice().sort((a, b) => {
      const ta = Date.parse(a.appliedAt || "") || 0;
      const tb = Date.parse(b.appliedAt || "") || 0;
      return ta - tb;
    });
    const withSerials = ascending.map((item, idx) => ({ ...item, _serial: idx + 1 }));
    sortedRawReferrals = withSerials.slice().reverse();

    referrals = sortedRawReferrals.map((item) => ({
      status: item.status,
      appliedAt: item.appliedAt,
      activatedAt: item.activatedAt || null,
    }));
  }

  // 2.5. Inline first page of enriched referees (referrer view).
  // 1 round-trip: client gets stats + first 20 referees in a single call.
  const firstPageRaw = sortedRawReferrals.slice(0, REFEREES_INLINE_PAGE_SIZE) as Array<Record<string, any> & { _serial: number }>;
  const refereeItems = await enrichReferees(firstPageRaw);
  const refereesNextCursor =
    sortedRawReferrals.length > REFEREES_INLINE_PAGE_SIZE
      ? encodeOffsetCursor(REFEREES_INLINE_PAGE_SIZE)
      : null;

  // 3. Check if I was referred by someone
  const myReferral = await client.send(
    new GetCommand({
      TableName: REFERRALS_TABLE,
      Key: { referredIdentityId: identityId },
    })
  );

  const referredBy = myReferral.Item
    ? {
        referralCode: myReferral.Item.referralCode,
        appliedAt: myReferral.Item.appliedAt,
        status: myReferral.Item.status,
        activatedAt: (myReferral.Item.activatedAt as string) || null,
      }
    : null;

  // 4. Fetch bonus stats from api-server (if URL configured)
  let bonusStats: { totalBonusPoints: number } | null = null;
  if (REFERRAL_STATS_API_URL && referralCode) {
    try {
      const headers: Record<string, string> = {};
      if (REFERRAL_STATS_API_KEY) headers["x-api-key"] = REFERRAL_STATS_API_KEY;
      const res = await fetch(
        `${REFERRAL_STATS_API_URL}?referrer=${encodeURIComponent(identityId)}`,
        { headers, signal: AbortSignal.timeout(5_000) }
      );
      if (res.ok) {
        bonusStats = await res.json();
      }
    } catch (err) {
      console.warn("[referral] Failed to fetch bonus stats:", err);
    }
  }

  return jsonResponse(
    200,
    {
      referralCode,
      totalReferrals: referrals.length,
      activatedCount: referrals.filter((r) => r.status === "ACTIVATED").length,
      pendingCount: referrals.filter((r) => r.status === "PENDING").length,
      referrals,
      referees: { items: refereeItems, nextCursor: refereesNextCursor },
      referredBy,
      bonusStats,
    },
    origin
  );
}

// ==================== GET /referral/my-referees ====================

async function handleMyReferees(
  identityId: string,
  query: { cursor?: string; limit?: string },
  origin?: string
): Promise<APIGatewayProxyResult> {
  const offset = decodeOffsetCursor(query.cursor);
  if (offset === null) {
    return jsonResponse(400, { error: "INVALID_CURSOR", message: "Cursor is malformed or from an incompatible version" }, origin);
  }
  let limit = parseInt(query.limit || String(REFEREES_INLINE_PAGE_SIZE), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = REFEREES_INLINE_PAGE_SIZE;
  if (limit > REFEREES_MAX_PAGE_SIZE) limit = REFEREES_MAX_PAGE_SIZE;

  const result = await client.send(
    new QueryCommand({
      TableName: REFERRALS_TABLE,
      IndexName: "referrerIdentityId-index",
      KeyConditionExpression: "referrerIdentityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
    })
  );

  // ASC sort to assign stable serials (oldest=1), then DESC for display.
  const ascending = (result.Items || []).slice().sort((a, b) => {
    const ta = Date.parse(a.appliedAt || "") || 0;
    const tb = Date.parse(b.appliedAt || "") || 0;
    return ta - tb;
  });
  const withSerials = ascending.map((item, idx) => ({ ...item, _serial: idx + 1 }));
  const sorted = withSerials.slice().reverse();

  const slice = sorted.slice(offset, offset + limit) as Array<Record<string, any> & { _serial: number }>;
  const items = await enrichReferees(slice);
  const nextCursor =
    sorted.length > offset + limit ? encodeOffsetCursor(offset + limit) : null;

  return jsonResponse(200, { items, nextCursor }, origin);
}

// ==================== Main handler ====================

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;
  const identityId = event.requestContext.authorizer?.identityId;

  if (!identityId) {
    return jsonResponse(401, { error: "UNAUTHORIZED", message: "Missing identity" }, origin);
  }

  const method = event.httpMethod;
  const path = event.resource || event.path;

  try {
    if (path.endsWith("/my-code") && method === "GET") {
      return await handleMyCode(identityId, origin);
    }

    if (path.endsWith("/apply") && method === "POST") {
      return await handleApply(identityId, event.body, origin);
    }

    if (path.endsWith("/my-stats") && method === "GET") {
      return await handleMyStats(identityId, origin);
    }

    if (path.endsWith("/my-referees") && method === "GET") {
      const q = event.queryStringParameters || {};
      return await handleMyReferees(
        identityId,
        { cursor: q.cursor, limit: q.limit },
        origin,
      );
    }

    return jsonResponse(404, { error: "NOT_FOUND", message: "Unknown endpoint" }, origin);
  } catch (err: any) {
    console.error("[referral] Handler error:", err);
    return jsonResponse(500, { error: "INTERNAL_ERROR", message: "Internal server error" }, origin);
  }
}
