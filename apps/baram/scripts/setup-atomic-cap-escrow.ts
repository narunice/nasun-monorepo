/**
 * Atomic cap+escrow setup (Plan C C3-v2 §A.1, DV5).
 *
 * Builds and executes the 3-command PTB
 *   Cmd 0: capability::new_capability_and_link
 *   Cmd 1: escrow::new_escrow_linked
 *   Cmd 2: capability::finalize_link_and_share
 * signed by the trader wallet (NOT the executor key).
 *
 * Required env (read from process.env, typically via --env-file):
 *   - AGENT_PRIVATE_KEY                  trader wallet bech32 / hex
 *   - SUI_RPC_URL                        nasun-devnet RPC (default: rpc.devnet.nasun.io)
 *   - AER_PACKAGE_ID                     baram_aer package
 *   - CAPABILITY_REGISTRY_ID             shared CapabilityRegistry
 *   - PADO_DEEPBOOK_PACKAGE_ID           allowed target
 *   - NUSDC_TYPE                         allowed asset (TypeName)
 *   - NBTC_TYPE                          allowed asset (TypeName)
 *   - PADO_DEEP_TYPE                     allowed asset (TypeName) — DEEP leftover for Cmd 5 destroy
 *
 * Optional env:
 *   - PAIR_LABEL                         human label printed alongside ids ("A" or "B")
 *   - MAX_NOTIONAL_PER_ACTION_RAW        default 2_000_000  (2 NUSDC raw)
 *   - MAX_DAILY_LOSS_RAW                 default 20_000_000 (20 NUSDC raw)
 *   - MAX_SLIPPAGE_BPS                   default 100
 *   - STOP_LOSS_BPS                      default 100
 *   - TAKE_PROFIT_BPS                    default 100
 *   - ALLOWED_ACTIONS_CSV                default trade.swap.v1
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=$(grep ^AGENT_PRIVATE_KEY ../agent-runner/.env | cut -d= -f2) \
 *     npx tsx --env-file=../executor-nitro/.env setup-atomic-cap-escrow.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[atomic-setup] FATAL: env "${key}" is unset.`);
    process.exit(1);
  }
  return v;
}

function bigintEnv(key: string, fallback: bigint): bigint {
  const v = process.env[key];
  if (!v) return fallback;
  return BigInt(v);
}

function intEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${key} must be integer`);
  return n;
}

function loadKeypair(raw: string): Ed25519Keypair {
  if (raw.startsWith('suiprivkey1')) {
    const decoded = decodeSuiPrivateKey(raw);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
}

async function main(): Promise<void> {
  const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
  const AER_PACKAGE_ID = required('AER_PACKAGE_ID');
  const CAPABILITY_REGISTRY_ID = required('CAPABILITY_REGISTRY_ID');
  const PADO_DEEPBOOK_PACKAGE_ID = required('PADO_DEEPBOOK_PACKAGE_ID');
  const NUSDC_TYPE = required('NUSDC_TYPE');
  const NBTC_TYPE = required('NBTC_TYPE');
  const PADO_DEEP_TYPE = required('PADO_DEEP_TYPE');
  const AGENT_PRIVATE_KEY = required('AGENT_PRIVATE_KEY');
  const PAIR_LABEL = process.env.PAIR_LABEL ?? '';

  const allowedActions = (process.env.ALLOWED_ACTIONS_CSV ?? 'trade.swap.v1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedAssets = [NUSDC_TYPE, NBTC_TYPE, PADO_DEEP_TYPE];
  const allowedTargets = [PADO_DEEPBOOK_PACKAGE_ID];
  const riskLimits = {
    maxNotionalPerAction: bigintEnv('MAX_NOTIONAL_PER_ACTION_RAW', 2_000_000n),
    maxDailyLoss: bigintEnv('MAX_DAILY_LOSS_RAW', 20_000_000n),
    maxSlippageBps: intEnv('MAX_SLIPPAGE_BPS', 100),
    stopLossBps: intEnv('STOP_LOSS_BPS', 100),
    takeProfitBps: intEnv('TAKE_PROFIT_BPS', 100),
  };

  const keypair = loadKeypair(AGENT_PRIVATE_KEY);
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[atomic-setup] sender=${sender} pair=${PAIR_LABEL || '(unlabeled)'}`);
  console.log(`[atomic-setup] allowed_actions=${JSON.stringify(allowedActions)}`);
  console.log(`[atomic-setup] allowed_assets=${allowedAssets.length} (NUSDC, NBTC, DEEP)`);
  console.log(`[atomic-setup] allowed_targets=${JSON.stringify(allowedTargets)}`);
  console.log(`[atomic-setup] risk=${JSON.stringify(riskLimits, (_k, v) => typeof v === 'bigint' ? v.toString() : v)}`);

  const tx = new Transaction();

  // Cmd 0: create capability + emit LinkWitness.
  // vector<TypeName> cannot be passed as a pure arg (TypeName is a struct,
  // not a primitive). Build the vector via inline `type_name::get<T>()`
  // moveCalls + makeMoveVec; this matches the on-chain encoding the
  // contract uses internally for `is_asset_allowed` comparisons.
  const typeNameElements = allowedAssets.map((t) =>
    tx.moveCall({
      target: '0x1::type_name::get',
      typeArguments: [t],
    }),
  );
  const allowedAssetsVec = tx.makeMoveVec({
    type: '0x1::type_name::TypeName',
    elements: typeNameElements,
  });

  const [cap, witness] = tx.moveCall({
    target: `${AER_PACKAGE_ID}::capability::new_capability_and_link`,
    arguments: [
      tx.object(CAPABILITY_REGISTRY_ID),
      tx.pure.vector('string', allowedActions),
      allowedAssetsVec,
      tx.pure.vector('address', allowedTargets),
      tx.pure.u64(riskLimits.maxNotionalPerAction),
      tx.pure.u64(riskLimits.maxDailyLoss),
      tx.pure.u16(riskLimits.maxSlippageBps),
      tx.pure.u16(riskLimits.stopLossBps),
      tx.pure.u16(riskLimits.takeProfitBps),
    ],
  });

  // Cmd 1: consume the witness, create + share AgentEscrow.
  const escrowId = tx.moveCall({
    target: `${AER_PACKAGE_ID}::escrow::new_escrow_linked`,
    arguments: [witness],
  });

  // Cmd 2: stamp escrow_id onto the cap, share the cap.
  tx.moveCall({
    target: `${AER_PACKAGE_ID}::capability::finalize_link_and_share`,
    arguments: [cap, escrowId],
  });

  tx.setSender(sender);
  tx.setGasBudget(80_000_000);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error(`[atomic-setup] TX FAILED: ${result.effects?.status?.error}`);
    console.error(JSON.stringify(result.effects, null, 2));
    process.exit(2);
  }

  console.log(`[atomic-setup] tx digest: ${result.digest}`);

  const created = result.objectChanges?.filter((c) => c.type === 'created') ?? [];
  let capId: string | undefined;
  let escId: string | undefined;
  for (const c of created) {
    if (c.type !== 'created') continue;
    if (c.objectType.includes('::capability::Capability')) capId = c.objectId;
    if (c.objectType.includes('::escrow::AgentEscrow')) escId = c.objectId;
  }

  if (!capId || !escId) {
    console.error('[atomic-setup] could not locate Capability or AgentEscrow in created objects');
    console.error(JSON.stringify(created, null, 2));
    process.exit(3);
  }

  console.log('');
  console.log(`[atomic-setup] CAPABILITY_ID${PAIR_LABEL ? '_' + PAIR_LABEL : ''}=${capId}`);
  console.log(`[atomic-setup] ESCROW_ID${PAIR_LABEL ? '_' + PAIR_LABEL : ''}=${escId}`);
  console.log(`[atomic-setup] WALLET_ADDRESS=${sender}`);
  console.log('');
  console.log('Reciprocal-binding verification (run manually):');
  console.log(`  nasun client object ${capId}    # expect escrow_id = Some(${escId})`);
  console.log(`  nasun client object ${escId}    # expect capability_id = ${capId}`);
}

main().catch((err) => {
  console.error('[atomic-setup] Unexpected error:', err);
  process.exit(1);
});
