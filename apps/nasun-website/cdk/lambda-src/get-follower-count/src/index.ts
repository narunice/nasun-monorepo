/**
 * Get Follower Count Lambda
 *
 * Fetches the @Nasun_io follower count via Twitter API v2.
 * Automatically refreshes the OAuth 2.0 access token when it is about to
 * expire (proactive, within 60 min) or when the API returns 401
 * (reactive), then retries. New tokens are persisted back to Secrets Manager
 * so subsequent invocations use the fresh token.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import { TwitterApi } from "twitter-api-v2";

const secretsClient = new SecretsManagerClient({ region: "ap-northeast-2" });

// Environment variables
const TARGET_USER_ID = process.env.TARGET_USER_ID || "1725466995565752320";
const TARGET_USERNAME = process.env.TARGET_USERNAME; // for logging only
const TWITTER_TOKENS_SECRET_NAME =
  process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens";
const FALLBACK_COUNT = 1000;

// Lambda in-memory cache (survives warm invocations)
let cachedFollowerCount: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Proactively refresh when token expires within this window
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawOAuth2Secret {
  clientId?: string;
  clientSecret?: string;
  userAccessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  [key: string]: unknown;
}

interface RawSecret {
  oauth2: RawOAuth2Secret;
  [key: string]: unknown;
}

interface TwitterSecrets {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  expiresAt: number | null;
  /** Full secret object — used when writing back to Secrets Manager */
  raw: RawSecret;
}

// ---------------------------------------------------------------------------
// Secrets Manager helpers
// ---------------------------------------------------------------------------

async function loadSecrets(): Promise<TwitterSecrets> {
  console.log(`[GET_FOLLOWER_COUNT] Loading secrets from: ${TWITTER_TOKENS_SECRET_NAME}`);

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: TWITTER_TOKENS_SECRET_NAME })
  );

  if (!response.SecretString) throw new Error("Secret value is empty");

  const raw = JSON.parse(response.SecretString) as RawSecret;

  if (!raw.oauth2?.userAccessToken) {
    throw new Error("OAuth 2.0 User Access Token not found in secrets");
  }

  return {
    accessToken: raw.oauth2.userAccessToken,
    refreshToken: raw.oauth2.refreshToken || "",
    clientId: raw.oauth2.clientId || "",
    clientSecret: raw.oauth2.clientSecret || "",
    expiresAt: raw.oauth2.expiresAt ?? null,
    raw,
  };
}

async function persistTokens(
  secrets: TwitterSecrets,
  newAccessToken: string,
  newRefreshToken: string,
  newExpiresAt: number,
  scope: string
): Promise<TwitterSecrets> {
  const updatedRaw: RawSecret = {
    ...secrets.raw,
    oauth2: {
      ...secrets.raw.oauth2,
      userAccessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      lastRefreshed: new Date().toISOString(),
      scope,
    },
  };

  await secretsClient.send(
    new UpdateSecretCommand({
      SecretId: TWITTER_TOKENS_SECRET_NAME,
      SecretString: JSON.stringify(updatedRaw, null, 2),
    })
  );

  console.log(
    `[GET_FOLLOWER_COUNT] Secrets Manager updated. New expiry: ${new Date(newExpiresAt).toISOString()}`
  );

  return {
    ...secrets,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt: newExpiresAt,
    raw: updatedRaw,
  };
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function refreshAccessToken(secrets: TwitterSecrets): Promise<TwitterSecrets> {
  if (!secrets.refreshToken) {
    throw new Error("No refresh token stored — re-run setup-oauth2-auto.ts");
  }
  if (!secrets.clientId || !secrets.clientSecret) {
    throw new Error("Client credentials missing from secrets — re-run setup-oauth2-auto.ts");
  }

  console.log("[GET_FOLLOWER_COUNT] Refreshing OAuth 2.0 access token...");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: secrets.refreshToken,
    client_id: secrets.clientId,
  });

  const credentials = Buffer.from(`${secrets.clientId}:${secrets.clientSecret}`).toString(
    "base64"
  );

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    refresh_token?: string; // Twitter rotates refresh tokens
    expires_in: number;
    scope: string;
  };

  const newExpiresAt = Date.now() + tokenData.expires_in * 1000;
  // Use new refresh token if provided (rotation), otherwise keep existing
  const newRefreshToken = tokenData.refresh_token || secrets.refreshToken;

  console.log(`[GET_FOLLOWER_COUNT] Token refreshed. Expires in ${tokenData.expires_in}s`);

  return persistTokens(
    secrets,
    tokenData.access_token,
    newRefreshToken,
    newExpiresAt,
    tokenData.scope
  );
}

// ---------------------------------------------------------------------------
// Twitter API
// ---------------------------------------------------------------------------

async function fetchFollowerCount(accessToken: string): Promise<number> {
  console.log(`[GET_FOLLOWER_COUNT] Fetching follower count for User ID: ${TARGET_USER_ID}`);

  const client = new TwitterApi(accessToken);
  const user = await client.v2.user(TARGET_USER_ID, {
    "user.fields": ["public_metrics", "username"],
  });

  if (!user.data) throw new Error(`User not found: ID ${TARGET_USER_ID}`);

  const followersCount = user.data.public_metrics?.followers_count ?? 0;
  const username = user.data.username || TARGET_USERNAME || "unknown";

  console.log(
    `[GET_FOLLOWER_COUNT] @${username} (ID: ${TARGET_USER_ID}) has ${followersCount} followers`
  );

  return followersCount;
}

function is401(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as { code?: number };
  return e.code === 401 || err.message.includes("401");
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io")
  .split(",")
  .map((o) => o.trim());

function corsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler = async (event?: { headers?: Record<string, string> }) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const headers = corsHeaders(origin);

  try {
    // 1. Return from in-memory cache if still fresh
    const now = Date.now();
    if (cachedFollowerCount !== null && now - cacheTimestamp < CACHE_TTL) {
      console.log(`[GET_FOLLOWER_COUNT] Returning cached value: ${cachedFollowerCount}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          count: cachedFollowerCount,
          username: TARGET_USERNAME,
          cached: true,
          updatedAt: new Date(cacheTimestamp).toISOString(),
        }),
      };
    }

    // 2. Load secrets from Secrets Manager
    let secrets = await loadSecrets();

    // 3. Proactive refresh: renew before token expires
    if (secrets.expiresAt !== null && secrets.expiresAt - now < REFRESH_THRESHOLD_MS) {
      console.log("[GET_FOLLOWER_COUNT] Token expires soon — proactive refresh");
      try {
        secrets = await refreshAccessToken(secrets);
      } catch (refreshErr) {
        // Non-fatal: log and attempt API call with existing token (may still work)
        console.error("[GET_FOLLOWER_COUNT] Proactive refresh failed:", refreshErr);
      }
    }

    // 4. Call Twitter API; on 401 perform one reactive refresh + retry
    let followerCount: number;
    try {
      followerCount = await fetchFollowerCount(secrets.accessToken);
    } catch (apiErr) {
      if (is401(apiErr) && secrets.refreshToken) {
        console.log("[GET_FOLLOWER_COUNT] Got 401 — reactive refresh + retry");
        secrets = await refreshAccessToken(secrets);
        followerCount = await fetchFollowerCount(secrets.accessToken);
      } else {
        throw apiErr;
      }
    }

    // 5. Update in-memory cache
    cachedFollowerCount = followerCount;
    cacheTimestamp = now;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        count: followerCount,
        username: TARGET_USERNAME,
        cached: false,
        updatedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("[GET_FOLLOWER_COUNT] Error:", err);

    // Return stale in-memory cache if available
    if (cachedFollowerCount !== null) {
      console.log(`[GET_FOLLOWER_COUNT] Returning stale cache: ${cachedFollowerCount}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          count: cachedFollowerCount,
          username: TARGET_USERNAME,
          cached: true,
          stale: true,
          updatedAt: new Date(cacheTimestamp).toISOString(),
        }),
      };
    }

    // Last resort: hardcoded fallback
    console.log(`[GET_FOLLOWER_COUNT] Returning fallback value: ${FALLBACK_COUNT}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        count: FALLBACK_COUNT,
        username: TARGET_USERNAME || "Nasun_io",
        cached: false,
        fallback: true,
        updatedAt: new Date().toISOString(),
      }),
    };
  }
};
