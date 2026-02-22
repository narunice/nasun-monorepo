/**
 * OAuth 2.0 Token Refresh Lambda Handler
 *
 * Automatically refreshes Twitter OAuth 2.0 tokens stored in AWS Secrets Manager.
 * Triggered by EventBridge every 70 minutes to prevent token expiration.
 *
 * Safety net math:
 * - Token validity: 120 min
 * - EventBridge interval: 70 min
 * - Refresh threshold: 60 min before expiry
 * - Guarantee: After 70 min, remaining <= 50 min -> always triggers refresh
 *
 * Ported from: apps/x-leaderboard-v2-legacy/cdk/lambda-src/x-leaderboard/src/handlers/system/refresh-oauth2-token.ts
 */

import { Handler } from "aws-lambda";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { refreshAccessToken, calculateTokenExpiry } from "./twitter-oauth";

const REGION = "ap-northeast-2";
const METRIC_NAMESPACE = "NASUN/OAuth";
const REFRESH_THRESHOLD_MINUTES = 60;
const MAX_UPDATE_RETRIES = 5;

// Reuse clients across warm invocations
const secretsClient = new SecretsManagerClient({ region: REGION });
const cloudwatchClient = new CloudWatchClient({ region: REGION });

interface RefreshTokenEvent {
  forceRefresh?: boolean;
}

interface RefreshTokenResult {
  success: boolean;
  refreshed: boolean;
  message: string;
  tokenInfo?: {
    expiresAt: string;
    expiresAtISO: string;
    scope: string;
    lastRefreshed: string;
  };
  error?: string;
}

async function publishMetric(
  name: string,
  value: number,
  unit: string = "Count",
): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: name,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
          },
        ],
      }),
    );
  } catch (error) {
    console.error(`[METRICS] Failed to publish ${name}:`, error);
  }
}

export const handler: Handler<RefreshTokenEvent, RefreshTokenResult> =
  async (event) => {
    const startTime = Date.now();
    console.log("[REFRESH_TOKEN] Start:", JSON.stringify(event));

    try {
      const secretId =
        process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens";
      const clientId = process.env.OAUTH2_CLIENT_ID;
      const clientSecret = process.env.OAUTH2_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error(
          "Missing OAUTH2_CLIENT_ID or OAUTH2_CLIENT_SECRET env vars",
        );
      }

      // 1. Fetch current tokens from Secrets Manager
      console.log(`[SECRETS_MANAGER] Fetching secret: ${secretId}`);
      const getSecretResponse = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );

      const currentValue = JSON.parse(
        getSecretResponse.SecretString || "{}",
      );
      const { oauth2 } = currentValue;

      if (!oauth2?.refreshToken) {
        throw new Error("No refresh token found in Secrets Manager");
      }

      // 2. Check token expiry
      const expiryDate = new Date(oauth2.expiresAt);
      const remainingMinutes = Math.floor(
        (expiryDate.getTime() - Date.now()) / 1000 / 60,
      );
      const needsRefresh =
        remainingMinutes <= REFRESH_THRESHOLD_MINUTES || event.forceRefresh;

      console.log(
        `[TOKEN_CHECK] Remaining: ${remainingMinutes}min, threshold: ${REFRESH_THRESHOLD_MINUTES}min, needsRefresh: ${needsRefresh}`,
      );

      await publishMetric("TokenRemainingMinutes", remainingMinutes, "None");

      if (!needsRefresh) {
        return {
          success: true,
          refreshed: false,
          message: `No refresh needed (${remainingMinutes}min remaining)`,
          tokenInfo: {
            expiresAt: oauth2.expiresAt.toString(),
            expiresAtISO: expiryDate.toISOString(),
            scope: oauth2.scope,
            lastRefreshed: oauth2.lastRefreshed || "N/A",
          },
        };
      }

      // 3. Refresh the token
      // CRITICAL: Twitter OAuth 2.0 Refresh Token Rotation (Single Use Policy)
      // Old refresh token is invalidated immediately after new token is issued.
      // Secrets Manager update MUST succeed or token becomes permanently invalid.
      const oldRefreshToken = oauth2.refreshToken;
      console.log(
        `[REFRESH] Requesting new token... (old RT: ${oldRefreshToken.substring(0, 20)}...)`,
      );

      let newTokenResponse;
      try {
        newTokenResponse = await refreshAccessToken(
          { clientId, clientSecret },
          oldRefreshToken,
        );
      } catch (error: any) {
        console.error("[TWITTER_API] Refresh failed:", error.message);

        if (error.message.includes("invalid")) {
          console.error(
            "[CRITICAL] Refresh token invalidated! Manual re-auth required.",
          );
          await publishMetric("InvalidRefreshToken", 1);
        }
        throw error;
      }

      console.log(
        `[REFRESH] New token received. expires_in: ${newTokenResponse.expires_in}s`,
      );

      // 4. Handle Refresh Token Rotation
      const hasRotation =
        newTokenResponse.refresh_token &&
        newTokenResponse.refresh_token !== oldRefreshToken;

      if (hasRotation) {
        console.log("[ROTATION] Refresh token rotated by Twitter");
        await publishMetric("RefreshTokenRotation", 1);
      }

      // 5. Update Secrets Manager (atomic, with retry)
      const newExpiresAt = calculateTokenExpiry(newTokenResponse.expires_in);
      const updatedValue = {
        ...currentValue,
        oauth2: {
          ...oauth2,
          userAccessToken: newTokenResponse.access_token,
          refreshToken:
            newTokenResponse.refresh_token || oauth2.refreshToken,
          expiresAt: newExpiresAt.getTime(),
          lastRefreshed: new Date().toISOString(),
          scope: newTokenResponse.scope,
        },
      };

      let updateSuccess = false;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_UPDATE_RETRIES; attempt++) {
        try {
          await secretsClient.send(
            new UpdateSecretCommand({
              SecretId: secretId,
              SecretString: JSON.stringify(updatedValue, null, 2),
            }),
          );
          updateSuccess = true;
          console.log(
            `[SECRETS_MANAGER] Update succeeded (attempt ${attempt})`,
          );
          break;
        } catch (error: any) {
          lastError = error;
          console.error(
            `[SECRETS_MANAGER] Attempt ${attempt}/${MAX_UPDATE_RETRIES} failed:`,
            error.message,
          );
          if (attempt < MAX_UPDATE_RETRIES) {
            const backoffMs = Math.pow(2, attempt - 1) * 1000;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }

      if (!updateSuccess) {
        console.error(
          "[CRITICAL] Secrets Manager update failed after all retries! Refresh token may be invalidated.",
        );
        await publishMetric("SecretUpdateFailure", 1);
        throw new Error(
          `Secrets Manager update failed after ${MAX_UPDATE_RETRIES} retries: ${lastError?.message}`,
        );
      }

      // 6. Report success
      const duration = Date.now() - startTime;
      console.log(
        `[REFRESH_TOKEN] Complete. Duration: ${duration}ms, new expiry: ${newExpiresAt.toISOString()}`,
      );
      await publishMetric("TokenRefreshSuccess", 1);

      return {
        success: true,
        refreshed: true,
        message: "Token refreshed successfully",
        tokenInfo: {
          expiresAt: newExpiresAt.getTime().toString(),
          expiresAtISO: newExpiresAt.toISOString(),
          scope: newTokenResponse.scope,
          lastRefreshed: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error("[REFRESH_TOKEN] Error:", error);
      await publishMetric("TokenRefreshFailure", 1);

      return {
        success: false,
        refreshed: false,
        message: "Token refresh failed",
        error: error.message || "Unknown error",
      };
    }
  };
