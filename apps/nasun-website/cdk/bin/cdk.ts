#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Require explicit NODE_ENV to prevent accidental cross-account contamination.
// Without this guard, omitting NODE_ENV would silently load production env vars
// and deploy them to the wrong AWS account.
const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv || !['development', 'production'].includes(nodeEnv)) {
  console.error('[CDK] ERROR: NODE_ENV must be explicitly set to "development" or "production".');
  console.error('[CDK] Usage: NODE_ENV=development npx cdk deploy <stack>');
  console.error('[CDK] Or use: /deploy nasun-website dev <stack>');
  process.exit(1);
}

const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

console.log(`[CDK] Loading environment: ${envFile} (NODE_ENV=${nodeEnv})`);

// Account-env mapping: ensures env vars are deployed to the correct AWS account.
// CDK will refuse to deploy if the current AWS credentials don't match env.account.
const EXPECTED_ACCOUNTS: Record<string, string> = {
  development: '__AWS_DEV_ACCOUNT__',
  production: '__AWS_PROD_ACCOUNT__',
};
const cdkEnv = { account: EXPECTED_ACCOUNTS[nodeEnv], region: 'ap-northeast-2' };

import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { CommonStack } from '../lib/common-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { NftEventStack } from '../lib/nft-event-stack';
import { AdminStack } from '../lib/admin-stack';
import { FollowerStack } from '../lib/follower-stack';
import { LeaderboardV3Stack } from '../lib/leaderboard-v3-stack';
import { DevnetMetricsStack } from '../lib/devnet-metrics-stack';
import { GenesisPassStack } from '../lib/genesis-pass-stack';
import { ReferralStack } from '../lib/referral-stack';
import { NftSnapshotStack } from '../lib/nft-snapshot-stack';
import { EcosystemStack } from '../lib/ecosystem-stack';
import { AirdropStack } from '../lib/airdrop-stack';

const app = new cdk.App();

// Common infrastructure stack (NFT, User Profile, Price API, AWS Credentials)
const commonStack = new CommonStack(app, 'CommonStack', { env: cdkEnv });

// Auth stack, depends on the common stack for the user profiles table
const authStack = new AuthStack(app, 'AuthStack', {
  env: cdkEnv,
  userProfilesTable: commonStack.userProfilesTable,
});
authStack.addDependency(commonStack);

// NFT Event stack (Wave 1 Battalion Free Mint)
const nftEventStack = new NftEventStack(app, 'NftEventStack', { env: cdkEnv });
// No dependencies - standalone stack with Feature Flag

// Admin stack (Whitelist Export, Governance Management)
const adminStack = new AdminStack(app, 'AdminStack', {
  env: cdkEnv,
  userProfilesTableName: 'UserProfiles',
  genesisTableName: 'GenesisNftWhitelist',
  battalionTableName: 'nasun-nft-whitelist',
});
// No dependencies - references existing tables by name

// OAuth2 token refresh stack (collect-followers removed — X API cost optimization)
// Dev schedule disabled: dev and prod share the same Twitter OAuth2 App + @Nasun_io account.
// Concurrent refresh from both environments causes refresh token cross-invalidation.
const isProduction = nodeEnv === 'production';
const followerStack = new FollowerStack(app, 'FollowerStack', {
  env: cdkEnv,
  twitterTokensSecretName: process.env.TWITTER_TOKENS_SECRET_NAME || 'nasun-twitter-tokens',
  enableTokenRefreshSchedule: isProduction,
});
// No dependencies - standalone stack

// Leaderboard V3 stack (Independent manual curation system)
const cognitoIdentityPoolId = process.env.VITE_COGNITO_IDENTITY_POOL_ID;
if (!cognitoIdentityPoolId) {
  throw new Error('VITE_COGNITO_IDENTITY_POOL_ID environment variable is required for LeaderboardV3Stack');
}

const leaderboardV3Stack = new LeaderboardV3Stack(app, 'LeaderboardV3Stack', {
  env: cdkEnv,
  environmentName: 'prod',
  cognitoIdentityPoolId,
  userProfilesTableName: 'UserProfiles',
});
// No dependencies - completely independent from V2

// Genesis Pass Allowlist stack
const genesisPassStack = new GenesisPassStack(app, 'GenesisPassStack', {
  env: cdkEnv,
  userProfilesTableName: 'UserProfiles',
  cognitoIdentityPoolId,
});
// No dependencies - references UserProfiles table by name

// Referral system stack
const referralStack = new ReferralStack(app, 'ReferralStack', {
  env: cdkEnv,
  userProfilesTableName: 'UserProfiles',
  cognitoIdentityPoolId,
});
// No dependencies - references UserProfiles table by name

// Devnet metrics stack (daily DAU/address collection via RPC)
const devnetMetricsStack = new DevnetMetricsStack(app, 'DevnetMetricsStack', { env: cdkEnv });
// No dependencies - standalone stack

// NFT snapshot stack (ETH daily ownership + Devnet on-demand backup)
const nftSnapshotStack = new NftSnapshotStack(app, 'NftSnapshotStack', { env: cdkEnv });
// No dependencies - standalone stack

// Ecosystem stack (NFT activation for ecosystem points)
const ecosystemStack = new EcosystemStack(app, 'EcosystemStack', {
  env: cdkEnv,
  userProfilesTableName: 'UserProfiles',
  cognitoIdentityPoolId,
});
// No dependencies - references tables by name

// Airdrop stack (April 16th Airdrop registration)
const airdropStack = new AirdropStack(app, 'AirdropStack', {
  env: cdkEnv,
  userProfilesTableName: 'UserProfiles',
  cognitoIdentityPoolId,
});
// No dependencies - references tables by name

// Monitoring stack — depends on Common, Auth, LeaderboardV3, and NftEvent stacks
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env: cdkEnv,
  priceApiGateway: commonStack.priceApiGateway,
  priceUpdaterLambda: commonStack.priceUpdaterLambda,
  governanceApi: commonStack.governanceApi,
  governanceApiLambda: commonStack.governanceApiLambda,
  metamaskAuthApi: authStack.metamaskAuthApi,
  leaderboardV3Api: leaderboardV3Stack.api,
  nftEventApi: nftEventStack.api,
});
monitoringStack.addDependency(commonStack);
monitoringStack.addDependency(authStack);
monitoringStack.addDependency(leaderboardV3Stack);
monitoringStack.addDependency(nftEventStack);
