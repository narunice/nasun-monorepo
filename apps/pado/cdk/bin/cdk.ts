#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

import * as cdk from 'aws-cdk-lib';
import { OracleStack } from '../lib/oracle-stack';
import { NewsStack } from '../lib/news-stack';

const app = new cdk.App();

// Read contract addresses from environment
const oraclePackageId = process.env.ORACLE_PACKAGE_ID || '';
const oracleRegistryId = process.env.ORACLE_REGISTRY_ID || '';
const adminCapId = process.env.ADMIN_CAP_ID || '';
const suiRpcUrl = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';

if (!oraclePackageId || !oracleRegistryId || !adminCapId) {
  console.error('Error: Oracle contract addresses must be set in environment');
  console.error(`Please set these in ${envFile}:`);
  console.error('  ORACLE_PACKAGE_ID=0x...');
  console.error('  ORACLE_REGISTRY_ID=0x...');
  console.error('  ADMIN_CAP_ID=0x...');
  process.exit(1);
}

console.log('[CDK] Deploying PadoOracleStack with:');
console.log(`  Environment: ${nodeEnv}`);
console.log(`  Package ID: ${oraclePackageId.slice(0, 16)}...`);
console.log(`  Registry ID: ${oracleRegistryId.slice(0, 16)}...`);
console.log(`  RPC URL: ${suiRpcUrl}`);

new OracleStack(app, 'PadoOracleStack', {
  env: { region: 'ap-northeast-2' },
  oraclePackageId,
  oracleRegistryId,
  adminCapId,
  suiRpcUrl,
});

// News Feed Stack (no contract dependencies)
new NewsStack(app, 'PadoNewsStack', {
  env: { region: 'ap-northeast-2' },
});
