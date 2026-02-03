#!/usr/bin/env npx tsx
/**
 * Basic Query Example
 *
 * Demonstrates querying executors and checking balance without executing inference.
 * Useful for verifying SDK setup and inspecting the on-chain state.
 *
 * Usage:
 *   PRIVATE_KEY=<hex-encoded-private-key> npx tsx examples/basic-query.ts
 */

import { BaramClient, createDevnetConfig, MODEL_PRICING } from '@nasun/baram-sdk';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable is required.');
    process.exit(1);
  }

  const signer = Ed25519Keypair.fromSecretKey(privateKey);
  const client = new BaramClient({
    config: createDevnetConfig(),
    signer,
  });

  console.log(`Address: ${client.getAddress()}`);

  // Check NUSDC balance
  const balance = await client.getBalance();
  console.log(`NUSDC Balance: ${balance / 1e6} NUSDC`);

  // List supported models
  console.log('\nSupported Models:');
  for (const [id, info] of Object.entries(MODEL_PRICING)) {
    console.log(`  ${id} — ${info.name} (${info.price / 1e6} NUSDC, ${info.provider})`);
  }

  // List active executors
  const executors = await client.getExecutors();
  console.log(`\nActive Executors: ${executors.length}`);
  for (const e of executors) {
    console.log(`  ${e.name}`);
    console.log(`    Tier: ${e.tierName} | TEE: ${e.teeTypeName} | Rep: ${e.reputation}`);
    console.log(`    Models: ${e.supportedModels.join(', ') || 'all'}`);
    console.log(`    Endpoint: ${e.endpointUrl}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
