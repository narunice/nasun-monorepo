/**
 * Get Follower Count Lambda
 * Twitter API를 사용하여 타겟 계정의 팔로워 수를 반환합니다.
 */

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { TwitterApi } from "twitter-api-v2";

const secretsClient = new SecretsManagerClient({ region: "ap-northeast-2" });

// 환경 변수
const TARGET_USERNAME = process.env.TARGET_USERNAME;
const TWITTER_TOKENS_SECRET_NAME = process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens";

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
 * Twitter API로 팔로워 수 조회
 */
async function fetchFollowerCount(secrets: TwitterSecrets): Promise<number> {
  if (!TARGET_USERNAME) {
    throw new Error("TARGET_USERNAME environment variable is not set");
  }

  console.log(`[GET_FOLLOWER_COUNT] Fetching follower count for @${TARGET_USERNAME}`);

  // OAuth 2.0 방식으로 API 호출 (User Context - X API 정책 변경으로 필수)
  const client = new TwitterApi(secrets.oauth2UserAccessToken);

  const user = await client.v2.userByUsername(TARGET_USERNAME, {
    "user.fields": ["public_metrics"],
  });

  if (!user.data) {
    throw new Error(`User not found: @${TARGET_USERNAME}`);
  }

  const followersCount = user.data.public_metrics?.followers_count ?? 0;

  console.log(`[GET_FOLLOWER_COUNT] @${TARGET_USERNAME} has ${followersCount} followers`);

  return followersCount;
}

/**
 * CORS 헤더
 */
const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Lambda Handler
 */
export const handler = async () => {
  try {
    // 캐시 확인
    const now = Date.now();
    if (cachedFollowerCount !== null && now - cacheTimestamp < CACHE_TTL) {
      console.log(`[GET_FOLLOWER_COUNT] Using cached value: ${cachedFollowerCount}`);
      return {
        statusCode: 200,
        headers: corsHeaders,
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
      headers: corsHeaders,
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
        headers: corsHeaders,
        body: JSON.stringify({
          count: cachedFollowerCount,
          username: TARGET_USERNAME,
          cached: true,
          stale: true,
          updatedAt: new Date(cacheTimestamp).toISOString(),
        }),
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch follower count",
        message: err instanceof Error ? err.message : "Unknown error",
      }),
    };
  }
};
