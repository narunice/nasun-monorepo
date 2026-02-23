#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import * as cdk from 'aws-cdk-lib';
import { BaramStack } from '../lib/baram-stack';

const app = new cdk.App();

// Read contract addresses from environment
const baramPackageId = process.env.VITE_BARAM_PACKAGE_ID || process.env.BARAM_PACKAGE_ID || '';
const baramRegistryId = process.env.VITE_BARAM_REGISTRY_ID || process.env.BARAM_REGISTRY_ID || '';
const aerPackageId = process.env.AER_PACKAGE_ID || '';
const aerRegistryId = process.env.AER_REGISTRY_ID || '';
const executorRegistryId = process.env.EXECUTOR_REGISTRY_ID || '';
const suiRpcUrl = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';

if (!baramPackageId || !baramRegistryId) {
  console.error('Error: BARAM_PACKAGE_ID and BARAM_REGISTRY_ID must be set in environment');
  console.error('Please set these in apps/baram/.env file:');
  console.error('  VITE_BARAM_PACKAGE_ID=0x...');
  console.error('  VITE_BARAM_REGISTRY_ID=0x...');
  process.exit(1);
}

console.log('[CDK] Deploying BaramStack with:');
console.log(`  Package ID: ${baramPackageId}`);
console.log(`  Registry ID: ${baramRegistryId}`);
console.log(`  AER Package: ${aerPackageId || '(not set - AER disabled)'}`);
console.log(`  AER Registry: ${aerRegistryId || '(not set)'}`);
console.log(`  Executor Registry: ${executorRegistryId || '(not set)'}`);
console.log(`  RPC URL: ${suiRpcUrl}`);

new BaramStack(app, 'BaramStack', {
  env: { region: 'ap-northeast-2' },
  baramPackageId,
  baramRegistryId,
  aerPackageId,
  aerRegistryId,
  executorRegistryId,
  suiRpcUrl,
});
