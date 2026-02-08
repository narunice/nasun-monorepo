#!/usr/bin/env npx tsx
/**
 * Baram SDK Agent Demo
 *
 * Demonstrates a Node.js agent using Baram's AI settlement pipeline.
 * The agent requests AI inference and receives an on-chain compliance record (ECR).
 *
 * Usage:
 *   PRIVATE_KEY=<hex-encoded-private-key> npx tsx examples/agent-demo.ts
 *   PRIVATE_KEY=<key> MODEL=llama-3.2-3b-local npx tsx examples/agent-demo.ts
 *
 * Prerequisites:
 *   - Wallet must have NUSDC (use faucet at https://explorer.nasun.io/devnet)
 *   - At least one active Executor must be registered on-chain
 */

import { BaramClient, createDevnetConfig } from '@nasun/baram-sdk';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable is required.');
    console.error('Usage: PRIVATE_KEY=<hex-key> npx tsx examples/agent-demo.ts');
    process.exit(1);
  }

  const model = process.env.MODEL || 'llama-3.3-70b-versatile';
  const prompt = process.env.PROMPT || 'What are the risk factors for BTC/USD in the next 24 hours?';

  // Initialize client
  const signer = Ed25519Keypair.fromSecretKey(privateKey);
  const client = new BaramClient({
    config: createDevnetConfig(),
    signer,
  });

  console.log(`[Agent] Address: ${client.getAddress()}`);
  console.log(`[Agent] Model: ${model}`);
  console.log(`[Agent] Prompt: ${prompt.slice(0, 80)}...`);

  // Check balance
  const balance = await client.getBalance();
  console.log(`[Agent] NUSDC Balance: ${balance / 1e6} NUSDC`);

  if (balance < 100_000) {
    console.error('[Agent] Insufficient NUSDC balance. Need at least 0.1 NUSDC.');
    process.exit(1);
  }

  // List available executors
  const executors = await client.getExecutors();
  console.log(`[Agent] Available Executors: ${executors.length}`);
  for (const e of executors) {
    console.log(`  - ${e.name} (${e.tierName}, rep: ${e.reputation}, models: ${e.supportedModels.join(', ') || 'all'})`);
  }

  // Execute inference
  console.log('\n[Agent] Submitting inference request...');
  const result = await client.execute({ prompt, model });

  console.log('\n=== Result ===');
  console.log(`Response: ${result.response.slice(0, 200)}...`);
  console.log(`Request ID: ${result.requestId}`);
  console.log(`TX Digest: ${result.txDigest}`);
  console.log(`Execution Time: ${result.executionTimeMs}ms`);
  console.log(`Executor: ${result.executor.name} (${result.executor.tierName})`);

  if (result.ecr) {
    console.log('\n=== On-Chain Compliance Record (ECR) ===');
    console.log(`ECR Object ID: ${result.ecr.objectId}`);
    console.log(`Requester: ${result.ecr.requester}`);
    console.log(`Executor: ${result.ecr.executor}`);
    console.log(`Model: ${result.ecr.model}`);
    console.log(`TEE Type: ${result.ecr.teeTypeName}`);
    console.log(`PCR Verified: ${result.ecr.pcrVerified}`);
    console.log(`Executor Tier: ${result.ecr.executorTierName}`);
    console.log(`Executor Reputation: ${result.ecr.executorReputation}`);
    console.log(`Payment: ${result.ecr.paymentAmount / 1e6} NUSDC`);
    console.log(`Settled At: ${new Date(result.ecr.settledAt).toLocaleString('en-US')}`);
    console.log(`\nExplorer: https://explorer.nasun.io/devnet/object/${result.ecr.objectId}`);
  } else {
    console.log('\n[Agent] ECR not yet available (may take a few seconds to propagate)');
  }
}

main().catch(err => {
  console.error('[Agent] Fatal error:', err.message);
  process.exit(1);
});
