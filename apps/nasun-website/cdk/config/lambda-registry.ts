/**
 * Lambda Function Registry
 * 
 * Purpose: 모든 Lambda 함수 정의를 중앙 집중 관리
 * - Handler 경로 불일치 방지
 * - 타입 안전성 보장
 * - 단일 진실 공급원 (Single Source of Truth)
 */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';

export interface LambdaConfig {
  constructId: string;
  functionName: string;
  handler: string;
  assetPath: string;
  runtime: lambda.Runtime;
  timeout: cdk.Duration;
  memorySize: number;
  description?: string;
}

export const lambdaRegistry: { [key: string]: LambdaConfig} = {
  'get-backup-prices': {
    constructId: 'GetBackupPricesLambda',
    functionName: 'GetBackupPricesLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/get-backup-prices/src',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-supply-count': {
    constructId: 'GetSupplyCountLambda',
    functionName: 'GetSupplyCountLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/getSupplyCount/src',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-all-supply-counts': {
    constructId: 'GetAllSupplyCountsLambda',
    functionName: 'GetAllSupplyCountsLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/getAllSupplyCounts',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'random-image-handler': {
    constructId: 'RandomImageHandlerLambda',
    functionName: 'RandomImageHandlerLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/randomImageHandler',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-user-profile': {
    constructId: 'GetUserProfileLambda',
    functionName: 'GetUserProfileLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/get-user-profile',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'link-account': {
    constructId: 'LinkAccountLambda',
    functionName: 'LinkAccountLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/link-account',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'wallet-api': {
    constructId: 'WalletApiLambda',
    functionName: 'WalletApiLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/wallet-api/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-aws-credentials': {
    constructId: 'GetAwsCredentialsLambda',
    functionName: 'GetAwsCredentialsLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/get-aws-credentials',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'twitter-auth': {
    constructId: 'TwitterAuthLambda',
    functionName: 'TwitterAuthLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/auth-twitter',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'update-backup-prices': {
    constructId: 'UpdateBackupPricesLambda',
    functionName: 'UpdateBackupPricesLambda',
    handler: 'index.handler',
    assetPath: 'lambda-src/update-backup-prices/src',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'price-api': {
    constructId: 'PriceApiLambda',
    functionName: 'PriceApiLambda',
    handler: 'lambda-handler.handler',
    assetPath: 'lambda-src/PriceAPI/lambda-package',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'price-updater': {
    constructId: 'PriceUpdaterLambda',
    functionName: 'PriceUpdaterLambda',
    handler: 'price-updater-handler.handler',
    assetPath: 'lambda-src/PriceAPI/lambda-package',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 256
  },
  'score-calculator': {
    constructId: 'CumulativeScoreCalculatorFunction',
    functionName: 'nasun-score-calculator',
    handler: 'batch/cumulative-score-calculator.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(10),
    memorySize: 256
  },
  'leaderboard-generator': {
    constructId: 'CumulativeLeaderboardGeneratorFunction',
    functionName: 'nasun-leaderboard-generator',
    handler: 'batch/cumulative-leaderboard-generator.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(15),
    memorySize: 512
  },
  'target-bookmark-collector': {
    constructId: 'TargetBookmarkCollectorFunction',
    functionName: 'nasun-target-bookmark-collector',
    handler: 'batch/target-bookmark-collector.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(15),
    memorySize: 512
  },
  'target-retweet-collector': {
    constructId: 'TargetRetweetCollectorFunction',
    functionName: 'nasun-target-retweet-collector',
    handler: 'batch/target-retweet-collector.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(15),
    memorySize: 512
  },
  'get-target-tweets': {
    constructId: 'GetTargetTweetsFunction',
    functionName: 'nasun-get-target-tweets',
    handler: 'batch/get-target-tweets.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 256
  },
  'collect-mentions': {
    constructId: 'CollectMentionsFunction',
    functionName: 'nasun-collect-mentions',
    handler: 'batch/collect-mentions.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(15),
    memorySize: 512
  },
  'aggregate-results': {
    constructId: 'AggregateResultsFunction',
    functionName: 'nasun-aggregate-results',
    handler: 'batch/aggregate-results.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(15),
    memorySize: 512
  },
  'handle-failure': {
    constructId: 'HandleFailureFunction',
    functionName: 'nasun-handle-failure',
    handler: 'batch/handle-failure.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 256
  },
  'get-leaderboard': {
    constructId: 'GetCumulativeLeaderboardFunction',
    functionName: 'nasun-get-leaderboard',
    handler: 'api/get-cumulative-leaderboard.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-bookmark-stats': {
    constructId: 'GetBookmarkStatsFunction',
    functionName: 'nasun-get-bookmark-stats',
    handler: 'api/get-bookmark-stats.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-excluded-accounts-status': {
    constructId: 'GetExcludedAccountsStatusFunction',
    functionName: 'nasun-get-excluded-accounts-status',
    handler: 'api/excluded-accounts-status.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'get-leaderboard-snapshot': {
    constructId: 'GetLeaderboardSnapshotFunction',
    functionName: 'nasun-get-leaderboard-snapshot',
    handler: 'api/get-leaderboard-snapshot.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'community-classifier-batch': {
    constructId: 'CommunityClassifierBatchFunction',
    functionName: 'nasun-community-classifier-batch',
    handler: 'batch/community-classifier-batch.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(15),
    memorySize: 512
  },
  'refresh-oauth2-token': {
    constructId: 'RefreshOAuth2TokenFunction',
    functionName: 'nasun-refresh-oauth2-token',
    handler: 'system/refresh-oauth2-token.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(1),
    memorySize: 256
  },
  'tweet-batch-splitter': {
    constructId: 'TweetBatchSplitterFunction',
    functionName: 'nasun-tweet-batch-splitter',
    handler: 'batch/tweet-batch-splitter.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256
  },
  'collect-likes': {
    constructId: 'CollectLikesFunction',
    functionName: 'nasun-collect-likes',
    handler: 'batch/collect-likes.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 512
  },
  'collect-retweets': {
    constructId: 'CollectRetweetsFunction',
    functionName: 'nasun-collect-retweets',
    handler: 'batch/collect-retweets.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 512
  },
  'collect-quotes': {
    constructId: 'CollectQuotesFunction',
    functionName: 'nasun-collect-quotes',
    handler: 'batch/collect-quotes.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 512
  },
  'collect-mentions-search': {
    constructId: 'MentionCollectorFunction',
    functionName: 'nasun-collect-mentions-search',
    handler: 'batch/collect-mentions-search.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(5),
    memorySize: 512
  },
  'collect-mention-details': {
    constructId: 'MentionDetailsCollectorFunction',
    functionName: 'nasun-collect-mention-details',
    handler: 'batch/collect-mention-details.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(10),
    memorySize: 512
  },
  'collect-high-engagement-replies': {
    constructId: 'HighEngagementReplyCollectorFunction',
    functionName: 'nasun-collect-high-engagement-replies',
    handler: 'batch/collect-high-engagement-replies.handler',
    assetPath: 'lambda-src/x-leaderboard/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(10),
    memorySize: 512
  },
  // ============================================
  // Leaderboard V3 - Independent from V2
  // ============================================
  'leaderboard-v3-create-post': {
    constructId: 'LeaderboardV3CreatePostFunction',
    functionName: 'nasun-leaderboard-v3-create-post',
    handler: 'handlers/create-post.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256,
    description: 'Leaderboard V3: Admin endpoint to register social media posts'
  },
  'leaderboard-v3-get-leaderboard': {
    constructId: 'LeaderboardV3GetLeaderboardFunction',
    functionName: 'nasun-leaderboard-v3-get-leaderboard',
    handler: 'handlers/get-leaderboard.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 512,
    description: 'Leaderboard V3: Public endpoint to get rankings'
  },
  'leaderboard-v3-get-account': {
    constructId: 'LeaderboardV3GetAccountFunction',
    functionName: 'nasun-leaderboard-v3-get-account',
    handler: 'handlers/get-account.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256,
    description: 'Leaderboard V3: Get account details for auto-prefill'
  },
  'leaderboard-v3-admin-seasons': {
    constructId: 'LeaderboardV3AdminSeasonsFunction',
    functionName: 'nasun-leaderboard-v3-admin-seasons',
    handler: 'handlers/admin-seasons.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256,
    description: 'Leaderboard V3: Admin CRUD for season management'
  },
  'leaderboard-v3-admin-stats': {
    constructId: 'LeaderboardV3AdminStatsFunction',
    functionName: 'nasun-leaderboard-v3-admin-stats',
    handler: 'handlers/admin-stats.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256,
    description: 'Leaderboard V3: Admin dashboard statistics'
  },
  'leaderboard-v3-get-top-climbers': {
    constructId: 'LeaderboardV3GetTopClimbersFunction',
    functionName: 'nasun-leaderboard-v3-get-top-climbers',
    handler: 'handlers/get-top-climbers.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.seconds(30),
    memorySize: 256,
    description: 'Leaderboard V3: Get top climbers'
  },
  'leaderboard-v3-generate-snapshot': {
    constructId: 'LeaderboardV3GenerateSnapshotFunction',
    functionName: 'nasun-leaderboard-v3-generate-snapshot',
    handler: 'handlers/generate-snapshot.handler',
    assetPath: 'lambda-src/leaderboard-v3/dist',
    runtime: lambda.Runtime.NODEJS_18_X,
    timeout: cdk.Duration.minutes(2),
    memorySize: 512,
    description: 'Leaderboard V3: Generate daily snapshot'
  }
};

export function getLambdaConfig(key: string): LambdaConfig {
  const config = lambdaRegistry[key];
  if (!config) {
    throw new Error(`Lambda configuration not found: ${key}`);
  }
  return config;
}

export function getAllLambdaKeys(): string[] {
  return Object.keys(lambdaRegistry);
}

