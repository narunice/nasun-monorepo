/**
 * One-shot: bump BaramRegistry.next_request_id past the global
 * ProcessedRequests high-water mark by chaining N calls to
 * create_request_with_budget_v2 in a single PTB.
 *
 * Why: ProcessedRequests (executor pkg) is a singleton keyed by raw
 * request_id. When baram is republished, the new BaramRegistry's
 * counter resets to 1 but ProcessedRequests already has 1..N from the
 * prior registry, so /execute-capability's Cmd 8
 * (executor::record_job_completion) aborts with
 * E_REQUEST_ALREADY_PROCESSED (106).
 *
 * Each call burns MIN_PRICE (0.1 NUSDC) from the trader's Budget.
 *
 * Required env (loaded from agent-runner/.env via --env-file):
 *   - AGENT_PRIVATE_KEY (Budget owner + agent)
 *   - BARAM_PACKAGE_ID, BARAM_REGISTRY_ID, BUDGET_ID
 *   - EXECUTOR_ADDRESS
 *   - RPC_URL (default https://rpc.devnet.nasun.io)
 *
 * Usage:
 *   N=120 npx tsx --env-file=../agent-runner/.env burn-request-ids.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { randomBytes } from 'node:crypto';

function required(k: string): string {
  const v = process.env[k];
  if (!v) { console.error(`burn-request-ids: env ${k} unset`); process.exit(1); }
  return v;
}

async function main(): Promise<void> {
  const RPC_URL = process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io';
  const PKG = required('BARAM_PACKAGE_ID');
  const REG = required('BARAM_REGISTRY_ID');
  const BUDGET = required('BUDGET_ID');
  const EXEC_ADDR = required('EXECUTOR_ADDRESS');
  const SK = required('AGENT_PRIVATE_KEY');
  const N = Number(process.env.N ?? 105);
  const PRICE = 100_000n; // MIN_PRICE = 0.1 NUSDC

  const keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(SK).secretKey);
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`burn-request-ids: sender=${sender}`);
  console.log(`burn-request-ids: will chain ${N} create_request calls @ ${PRICE} per call`);

  const tx = new Transaction();
  for (let i = 0; i < N; i++) {
    const promptHash = Array.from(randomBytes(32));
    tx.moveCall({
      target: `${PKG}::baram::create_request_with_budget_v2`,
      arguments: [
        tx.object(REG),
        tx.object(BUDGET),
        tx.pure.vector('u8', promptHash),
        tx.pure.string('llama-3.3-70b-versatile'),
        tx.pure.address(EXEC_ADDR),
        tx.pure.u64(PRICE),
        tx.pure.string('ai_inference'),
        tx.object('0x6'),
      ],
    });
  }
  tx.setSender(sender);
  tx.setGasBudget(2_000_000_000);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  const status = result.effects?.status?.status;
  console.log(`burn-request-ids: digest=${result.digest} status=${status}`);
  if (status !== 'success') {
    console.error('error:', result.effects?.status?.error);
    process.exit(2);
  }
  console.log(`burn-request-ids: bumped registry by ${N} request_ids.`);
}

main().catch((err) => { console.error('burn-request-ids:', err); process.exit(1); });
