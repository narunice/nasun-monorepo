#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// 환경별 .env 파일 로드
const nodeEnv = process.env.NODE_ENV || 'production';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

console.log(`[CDK] Loading environment: ${envFile} (NODE_ENV=${nodeEnv})`);

import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import { AuthStack } from '../lib/auth-stack';
import { CommonStack } from '../lib/common-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { NftEventStack } from '../lib/nft-event-stack';
import { AdminStack } from '../lib/admin-stack';
import { FollowerStack } from '../lib/follower-stack';

const app = new cdk.App();

// Common infrastructure stack (NFT, User Profile, Price API, AWS Credentials)
const commonStack = new CommonStack(app, 'CommonStack', {
  env: { region: 'ap-northeast-2' }
});

// Main application stack (Leaderboard system)
const mainStack = new CdkStack(app, 'CdkStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Auth stack, depends on the common stack for the user profiles table
const authStack = new AuthStack(app, 'AuthStack', {
  userProfilesTable: commonStack.userProfilesTable,
});
authStack.addDependency(commonStack);

// Monitoring stack, depends on both common and main stacks
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  priceApiGateway: commonStack.priceApiGateway,
  nasunApi: mainStack.nasunApi,
  priceUpdaterLambda: commonStack.priceUpdaterLambda,
  cumulativeScoreCalculatorFunction: mainStack.cumulativeScoreCalculatorFunction,
  cumulativeLeaderboardGeneratorFunction: mainStack.cumulativeLeaderboardGeneratorFunction,
  getCumulativeLeaderboardFunction: mainStack.getCumulativeLeaderboardFunction,
  getBookmarkStatsFunction: mainStack.getBookmarkStatsFunction,
  cumulativeLeaderboardTable: mainStack.cumulativeLeaderboardTable,
  leaderboardDataPipeline: mainStack.leaderboardDataPipeline,

  // Lambda Timeout Monitoring (Stage 3)
  getUserRankFunction: mainStack.getUserRankFunction,
  collectLikesFunction: mainStack.collectLikesFunction,
  collectRetweetsFunction: mainStack.collectRetweetsFunction,
  collectQuotesFunction: mainStack.collectQuotesFunction,
  mentionCollectorFunction: mainStack.mentionCollectorFunction,
  mentionDetailsCollectorFunction: mainStack.mentionDetailsCollectorFunction,
  aggregateResultsFunction: mainStack.aggregateResultsFunction,

  // OAuth 2.0 Token Refresh Monitoring
  refreshOAuth2TokenFunction: mainStack.refreshOAuth2TokenFunction,
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

monitoringStack.addDependency(mainStack);
monitoringStack.addDependency(commonStack);

// NFT Event stack (Wave 1 Battalion Free Mint)
const nftEventStack = new NftEventStack(app, 'NftEventStack', {
  env: { region: 'ap-northeast-2' },
});
// No dependencies - standalone stack with Feature Flag

// Admin stack (Whitelist Export, Governance Management)
const adminStack = new AdminStack(app, 'AdminStack', {
  env: { region: 'ap-northeast-2' },
  userProfilesTableName: 'UserProfiles',
  genesisTableName: 'GenesisNftWhitelist',
  battalionTableName: 'nasun-nft-whitelist',
});
// No dependencies - references existing tables by name

// Follower collection stack (X API daily follower tracking)
const followerStack = new FollowerStack(app, 'FollowerStack', {
  env: { region: 'ap-northeast-2' },
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  targetAccounts: process.env.TARGET_ACCOUNTS || '[]',
});
// No dependencies - standalone stack