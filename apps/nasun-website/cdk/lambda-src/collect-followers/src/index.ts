// Lambda handler for collecting X followers

import { ScheduledEvent, Context } from 'aws-lambda';
import { getEnvConfig, validateEnvConfig, TargetAccount } from './utils/env';
import { TwitterApiService } from './services/twitter-api';
import { FollowerStore } from './services/follower-store';
import { TokenManager } from './services/token-manager';

interface CollectionResult {
  target: string;
  success: boolean;
  totalFollowers?: number;
  newFollowers?: number;
  unfollowed?: number;
  error?: string;
}

interface HandlerResponse {
  statusCode: number;
  results: CollectionResult[];
  executionTime: number;
}

/**
 * Lambda handler for daily follower collection
 * Triggered by EventBridge Schedule
 */
export const handler = async (
  event: ScheduledEvent,
  context: Context
): Promise<HandlerResponse> => {
  const startTime = Date.now();
  console.log('[COLLECT_FOLLOWERS] Lambda started');
  console.log('[COLLECT_FOLLOWERS] Event:', JSON.stringify(event));

  // Load and validate configuration
  const config = getEnvConfig();
  const validationErrors = validateEnvConfig(config);

  if (validationErrors.length > 0) {
    console.error('[COLLECT_FOLLOWERS] Configuration errors:', validationErrors);
    return {
      statusCode: 400,
      results: [
        {
          target: 'config',
          success: false,
          error: `Configuration errors: ${validationErrors.join(', ')}`,
        },
      ],
      executionTime: Date.now() - startTime,
    };
  }

  // Initialize services
  // Use OAuth 2.0 User Context token for followers endpoint (Free tier compatible)
  const tokenManager = new TokenManager(config.awsRegion);
  let twitterApi: TwitterApiService;

  try {
    const oauth2Token = await tokenManager.getOAuth2Token();
    twitterApi = TwitterApiService.withOAuth2UserContext(oauth2Token);
    console.log('[COLLECT_FOLLOWERS] Using OAuth 2.0 User Context authentication');
  } catch (error: any) {
    // Fallback to Bearer token (requires Basic tier)
    console.log('[COLLECT_FOLLOWERS] OAuth 2.0 not available, falling back to Bearer token');
    const bearerToken = await tokenManager.getBearerToken();
    twitterApi = TwitterApiService.withBearerToken(bearerToken);
  }

  const followerStore = new FollowerStore(
    config.followersTableName,
    config.awsRegion
  );

  const results: CollectionResult[] = [];

  // Process each target account
  for (const target of config.targetAccounts) {
    console.log(`[COLLECT_FOLLOWERS] Processing target: @${target.username}`);

    try {
      const result = await processTargetAccount(
        target,
        twitterApi,
        followerStore
      );
      results.push(result);

      // Rate limit protection: wait 60 seconds between accounts
      if (config.targetAccounts.indexOf(target) < config.targetAccounts.length - 1) {
        console.log('[COLLECT_FOLLOWERS] Waiting 60 seconds before next account...');
        await delay(60000);
      }
    } catch (error: any) {
      console.error(
        `[COLLECT_FOLLOWERS] Error processing @${target.username}:`,
        error.message
      );
      results.push({
        target: target.username,
        success: false,
        error: error.message,
      });
    }
  }

  const executionTime = Date.now() - startTime;
  console.log(`[COLLECT_FOLLOWERS] Completed in ${executionTime}ms`);
  console.log('[COLLECT_FOLLOWERS] Results:', JSON.stringify(results, null, 2));

  return {
    statusCode: results.every((r) => r.success) ? 200 : 207, // 207 = Multi-Status
    results,
    executionTime,
  };
};

/**
 * Process a single target account
 */
async function processTargetAccount(
  target: TargetAccount,
  twitterApi: TwitterApiService,
  followerStore: FollowerStore
): Promise<CollectionResult> {
  // 1. Fetch current followers from X API
  console.log(`[COLLECT_FOLLOWERS] Fetching followers for @${target.username}...`);
  const currentFollowers = await twitterApi.fetchAllFollowers(target.userId);

  if (currentFollowers.length === 0) {
    console.warn(`[COLLECT_FOLLOWERS] No followers found for @${target.username}`);
    return {
      target: target.username,
      success: true,
      totalFollowers: 0,
      newFollowers: 0,
      unfollowed: 0,
    };
  }

  // 2. Get existing followers from DynamoDB
  console.log(`[COLLECT_FOLLOWERS] Loading existing followers for @${target.username}...`);
  const existingFollowers = await followerStore.getExistingFollowers(target.username);

  // 3. Calculate diff
  const { newFollowers, unfollowed } = followerStore.diffFollowers(
    existingFollowers,
    currentFollowers
  );

  // 4. Update DynamoDB
  console.log(`[COLLECT_FOLLOWERS] Updating followers for @${target.username}...`);
  await followerStore.updateFollowers(
    target.username,
    currentFollowers,
    newFollowers,
    unfollowed
  );

  // 5. Record history
  console.log(`[COLLECT_FOLLOWERS] Recording history for @${target.username}...`);
  await followerStore.recordHistory(target.username, {
    totalFollowers: currentFollowers.length,
    newFollowers: newFollowers.length,
    unfollowed: unfollowed.length,
    newFollowerIds: newFollowers.map((f) => f.id),
    unfollowedIds: unfollowed.map((f) => f.userId),
  });

  return {
    target: target.username,
    success: true,
    totalFollowers: currentFollowers.length,
    newFollowers: newFollowers.length,
    unfollowed: unfollowed.length,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// For local testing
if (require.main === module) {
  const mockEvent: ScheduledEvent = {
    version: '0',
    id: 'test',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: new Date().toISOString(),
    region: 'ap-northeast-2',
    resources: [],
    detail: {},
  };

  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:ap-northeast-2:123456789012:function:test',
    memoryLimitInMB: '512',
    awsRequestId: 'test',
    logGroupName: 'test',
    logStreamName: 'test',
    getRemainingTimeInMillis: () => 300000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  handler(mockEvent, mockContext)
    .then((result) => {
      console.log('Result:', JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error('Error:', error);
    });
}
