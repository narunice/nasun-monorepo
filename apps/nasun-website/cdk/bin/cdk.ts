#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// 환경별 .env 파일 로드
const nodeEnv = process.env.NODE_ENV || 'production';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

console.log(`[CDK] Loading environment: ${envFile} (NODE_ENV=${nodeEnv})`);

import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { CommonStack } from '../lib/common-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { NftEventStack } from '../lib/nft-event-stack';
import { AdminStack } from '../lib/admin-stack';
import { FollowerStack } from '../lib/follower-stack';
import { LeaderboardV3Stack } from '../lib/leaderboard-v3-stack';

const app = new cdk.App();

// Common infrastructure stack (NFT, User Profile, Price API, AWS Credentials)
const commonStack = new CommonStack(app, 'CommonStack', {
  env: { region: 'ap-northeast-2' }
});

// Auth stack, depends on the common stack for the user profiles table
const authStack = new AuthStack(app, 'AuthStack', {
  userProfilesTable: commonStack.userProfilesTable,
});
authStack.addDependency(commonStack);

// Monitoring stack, depends on common stack
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  priceApiGateway: commonStack.priceApiGateway,
  priceUpdaterLambda: commonStack.priceUpdaterLambda,
});
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

// Follower collection stack (X API daily follower tracking + OAuth2 token refresh)
const followerStack = new FollowerStack(app, 'FollowerStack', {
  env: { region: 'ap-northeast-2' },
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  targetAccounts: process.env.TARGET_ACCOUNTS || '[]',
  twitterTokensSecretName: process.env.TWITTER_TOKENS_SECRET_NAME || 'nasun-twitter-tokens',
});
// No dependencies - standalone stack

// Leaderboard V3 stack (Independent manual curation system)
const cognitoIdentityPoolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
if (!cognitoIdentityPoolId) {
  throw new Error('VITE_COGNITO_IDENTITY_POOL_ID environment variable is required for LeaderboardV3Stack');
}

const leaderboardV3Stack = new LeaderboardV3Stack(app, 'LeaderboardV3Stack', {
  env: { region: 'ap-northeast-2' },
  environmentName: 'prod',
  cognitoIdentityPoolId,
  userProfilesTableName: 'UserProfiles',
});
// No dependencies - completely independent from V2