#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment-specific .env file
const nodeEnv = process.env.NODE_ENV || 'production';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

console.log(`[CDK] Loading environment: ${envFile} (NODE_ENV=${nodeEnv})`);

import * as cdk from 'aws-cdk-lib';
import { XLeaderboardStack } from '../lib/x-leaderboard-stack';

const app = new cdk.App();

new XLeaderboardStack(app, 'XLeaderboardStack', {
  env: { region: 'ap-northeast-2' },
});
