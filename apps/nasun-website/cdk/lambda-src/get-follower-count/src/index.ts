/**
 * Get Follower Count Lambda
 * Twitter API를 사용하여 타겟 계정의 팔로워 수를 반환합니다.
 */

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { TwitterApi } from "twitter-api-v2";

const secretsClient = new SecretsManagerClient({ region: "ap-northeast-2" });

// 환경 변수
const TARGET_USER_ID = process.env.TARGET_USER_ID || "1725466995565752320";
const TARGET_USERNAME = process.env.TARGET_USERNAME; // For logging only
const TWITTER_TOKENS_SECRET_NAME = process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens";
const FALLBACK_COUNT = 1000;

// 캐시 (Lambda 실행 간 유지)
let cachedFollowerCount: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간

interface TwitterSecrets {
  oauth2UserAccessToken: string;
}

/**
 * Secrets Manager에서 Twitter 토큰 가져오기
 */
async function getTwitterSecrets(): Promise<TwitterSecrets> {
  console.log(`[GET_FOLLOWER_COUNT] Fetching secrets from: ${TWITTER_TOKENS_SECRET_NAME}`);

  const command = new GetSecretValueCommand({
    SecretId: TWITTER_TOKENS_SECRET_NAME,
  });

  const response = await secretsClient.send(command);

  if (!response.SecretString) {
    throw new Error("Secret value is empty");
  }

  const secrets = JSON.parse(response.SecretString);

  if (!secrets.oauth2?.userAccessToken) {
    throw new Error("OAuth 2.0 User Access Token not found in secrets");
  }

  return {
    oauth2UserAccessToken: secrets.oauth2.userAccessToken,
  };
}

/**
 * Twitter API로 팔로워 수 조회 (User ID 기반 - 핸들 변경에 안전)
 */
async function fetchFollowerCount(secrets: TwitterSecrets): Promise<number> {
  console.log(`[GET_FOLLOWER_COUNT] Fetching follower count for User ID: ${TARGET_USER_ID}`);

  // OAuth 2.0 방식으로 API 호출 (User Context - X API 정책 변경으로 필수)
  const client = new TwitterApi(secrets.oauth2UserAccessToken);

  // User ID 기반 조회 (핸들 변경에도 안전)
  const user = await client.v2.user(TARGET_USER_ID, {
    "user.fields": ["public_metrics", "username"],
  });

  if (!user.data) {
    throw new Error(`User not found: ID ${TARGET_USER_ID}`);
  }

  const followersCount = user.data.public_metrics?.followers_count ?? 0;
  const username = user.data.username || TARGET_USERNAME || "unknown";

  console.log(`[GET_FOLLOWER_COUNT] @${username} (ID: ${TARGET_USER_ID}) has ${followersCount} followers`);

  return followersCount;
}

/**
 * CORS headers
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Lambda Handler
 */
export const handler = async (event?: { headers?: Record<string, string> }) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const headers = corsHeaders(origin);
  try {
    // 캐시 확인
    const now = Date.now();
    if (cachedFollowerCount !== null && now - cacheTimestamp < CACHE_TTL) {
      console.log(`[GET_FOLLOWER_COUNT] Using cached value: ${cachedFollowerCount}`);
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

    // Twitter API 호출
    const secrets = await getTwitterSecrets();
    const followerCount = await fetchFollowerCount(secrets);

    // 캐시 업데이트
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

    // 에러 시 캐시된 값 반환 (있다면)
    if (cachedFollowerCount !== null) {
      console.log(`[GET_FOLLOWER_COUNT] Returning stale cache due to error: ${cachedFollowerCount}`);
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

    // Return fallback count instead of error (never show 0)
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
