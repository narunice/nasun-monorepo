/**
 * Get Follower Count Lambda
 *
 * Fetches the @Nasun_io follower count via Twitter API v2.
 * Uses Bearer Token (App-Only) which never expires.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
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

// ---------------------------------------------------------------------------
// Secrets Manager (read-only)
// ---------------------------------------------------------------------------

async function loadAccessToken(): Promise<string> {
  console.log(`[GET_FOLLOWER_COUNT] Loading secrets from: ${TWITTER_TOKENS_SECRET_NAME}`);

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: TWITTER_TOKENS_SECRET_NAME })
  );

  if (!response.SecretString) throw new Error("Secret value is empty");

  const raw = JSON.parse(response.SecretString);

  if (!raw.bearerToken) {
    throw new Error("No Bearer Token found in secrets");
  }

  console.log("[GET_FOLLOWER_COUNT] Using Bearer Token (App-Only)");
  return raw.bearerToken;
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

    // 2. Load access token from Secrets Manager (read-only, no refresh)
    const accessToken = await loadAccessToken();

    // 3. Call Twitter API
    const followerCount = await fetchFollowerCount(accessToken);

    // 4. Update in-memory cache
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
