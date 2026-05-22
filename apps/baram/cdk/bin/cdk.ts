#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Require explicit NODE_ENV to prevent accidental cross-account contamination.
// Without this guard, omitting NODE_ENV would silently use whatever process.env
// holds and could deploy prod-bound config to the dev account (or vice versa).
// Pattern mirrors apps/nasun-website/cdk/bin/cdk.ts.
const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv || !['development', 'production'].includes(nodeEnv)) {
  console.error('[CDK] ERROR: NODE_ENV must be explicitly set to "development" or "production".');
  console.error('[CDK] Usage: NODE_ENV=development npx cdk deploy BaramStackDev');
  console.error('[CDK]        NODE_ENV=production  npx cdk deploy BaramStackProd --profile nasun-prod');
  process.exit(1);
}

const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

console.log(`[CDK] Loading environment: ${envFile} (NODE_ENV=${nodeEnv})`);

// Account-env mapping mirrors nasun-website/pado CDK. CDK refuses to deploy
// if the active AWS credentials don't match env.account.
const EXPECTED_ACCOUNTS: Record<string, string> = {
  development: '135808943968',
  production: '466841130170',
};
const cdkEnv = { account: EXPECTED_ACCOUNTS[nodeEnv], region: 'ap-northeast-2' };

import * as cdk from 'aws-cdk-lib';
import { BaramStack } from '../lib/baram-stack';

const app = new cdk.App();

const baramPackageId = process.env.VITE_BARAM_PACKAGE_ID || process.env.BARAM_PACKAGE_ID || '';
const baramRegistryId = process.env.VITE_BARAM_REGISTRY_ID || process.env.BARAM_REGISTRY_ID || '';
const aerPackageId = process.env.AER_PACKAGE_ID || '';
const aerRegistryId = process.env.AER_REGISTRY_ID || '';
const executorPackageId = process.env.EXECUTOR_PACKAGE_ID || '';
const executorRegistryId = process.env.EXECUTOR_REGISTRY_ID || '';
const executorProcessedRequestsId = process.env.EXECUTOR_PROCESSED_REQUESTS_ID || '';
const suiRpcUrl = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';

// PR1.5 swap path gates. Default LAMBDA_SWAP_DISABLED to "true" so a deploy
// without explicit env values cannot accidentally enable the swap path.
const lambdaSwapDisabled = process.env.LAMBDA_SWAP_DISABLED || 'true';
const deepbookPackageAllowlist = process.env.DEEPBOOK_PACKAGE_ALLOWLIST || '';
const deepbookPoolAllowlist = process.env.DEEPBOOK_POOL_ALLOWLIST || '';
const deepType = process.env.DEEP_TYPE || '';
const maxSlippageBpsCap = process.env.MAX_SLIPPAGE_BPS_CAP || '500';

if (!baramPackageId || !baramRegistryId) {
  console.error('[CDK] ERROR: BARAM_PACKAGE_ID and BARAM_REGISTRY_ID must be set.');
  console.error(`[CDK] Edit apps/baram/cdk/${envFile} to set:`);
  console.error('[CDK]   VITE_BARAM_PACKAGE_ID=0x...');
  console.error('[CDK]   VITE_BARAM_REGISTRY_ID=0x...');
  process.exit(1);
}

const isProd = nodeEnv === 'production';
// Dev keeps the original construct id 'BaramStack' so all child resource
// logical ids stay stable and `cdk deploy` updates the existing CloudFormation
// stack in place (no replace of baram-executor Lambda / DynamoDB table).
// Prod is a brand-new stack in a brand-new account → 'BaramStackProd'.
const stackId = isProd ? 'BaramStackProd' : 'BaramStack';

console.log(`[CDK] Deploying ${stackId} to account ${cdkEnv.account}`);
console.log(`  Package ID: ${baramPackageId}`);
console.log(`  Registry ID: ${baramRegistryId}`);
console.log(`  AER Package: ${aerPackageId || '(not set - AER disabled)'}`);
console.log(`  AER Registry: ${aerRegistryId || '(not set)'}`);
console.log(`  Executor Package: ${executorPackageId || '(not set - heartbeat disabled)'}`);
console.log(`  Executor Registry: ${executorRegistryId || '(not set)'}`);
console.log(`  Executor ProcessedRequests: ${executorProcessedRequestsId || '(not set - heartbeat disabled)'}`);
console.log(`  RPC URL: ${suiRpcUrl}`);
console.log(`  Swap path: LAMBDA_SWAP_DISABLED=${lambdaSwapDisabled}`);
console.log(`    DeepBook pkg allowlist: ${deepbookPackageAllowlist || '(empty)'}`);
console.log(`    DeepBook pool allowlist: ${deepbookPoolAllowlist || '(empty)'}`);
console.log(`    DEEP type: ${deepType || '(empty)'}`);
console.log(`    Max slippage cap: ${maxSlippageBpsCap} bps`);

new BaramStack(app, stackId, {
  env: cdkEnv,
  isProduction: isProd,
  baramPackageId,
  baramRegistryId,
  aerPackageId,
  aerRegistryId,
  executorPackageId,
  executorRegistryId,
  executorProcessedRequestsId,
  suiRpcUrl,
  lambdaSwapDisabled,
  deepbookPackageAllowlist,
  deepbookPoolAllowlist,
  deepType,
  maxSlippageBpsCap,
});
