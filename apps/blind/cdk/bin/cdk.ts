#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import * as cdk from 'aws-cdk-lib';
import { BlindStack } from '../lib/blind-stack';

const app = new cdk.App();

// Read contract addresses from environment
const blindPackageId = process.env.VITE_BLIND_PACKAGE_ID || process.env.BLIND_PACKAGE_ID || '';
const blindRegistryId = process.env.VITE_BLIND_REGISTRY_ID || process.env.BLIND_REGISTRY_ID || '';
const suiRpcUrl = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';

if (!blindPackageId || !blindRegistryId) {
  console.error('Error: BLIND_PACKAGE_ID and BLIND_REGISTRY_ID must be set in environment');
  console.error('Please set these in apps/blind/.env file:');
  console.error('  VITE_BLIND_PACKAGE_ID=0x...');
  console.error('  VITE_BLIND_REGISTRY_ID=0x...');
  process.exit(1);
}

console.log('[CDK] Deploying BlindStack with:');
console.log(`  Package ID: ${blindPackageId}`);
console.log(`  Registry ID: ${blindRegistryId}`);
console.log(`  RPC URL: ${suiRpcUrl}`);

new BlindStack(app, 'BlindStack', {
  env: { region: 'ap-northeast-2' },
  blindPackageId,
  blindRegistryId,
  suiRpcUrl,
});
