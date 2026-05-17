/**
 * Transaction builders for Nasun AI flows: agent profile registration, budget
 * lifecycle (create/deposit/withdraw/deactivate), constraint and spending limit
 * updates, and create_request / cancel_request. The underlying Move modules
 * still live in the `baram::*` namespace (ARCHIVED but not renamed onchain).
 */

import { Transaction } from '@mysten/sui/transactions';
import { BARAM } from '@nasun/devnet-config';
import type { CoinRef } from './coinService';

const SUI_CLOCK_ID = '0x6';
const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function validateObjectId(id: string, label: string): void {
  if (!SUI_OBJECT_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: expected 0x + 64 hex chars`);
  }
}

// `vector<std::type_name::TypeName>` cannot be passed as a pure PTB arg
// (TypeName is a struct, not a primitive — Sui rejects with
// `InvalidUsageOfPureArg`). Build the vector via inline
// `0x1::type_name::get<T>()` moveCalls + makeMoveVec, matching the encoding
// the on-chain `capability::is_asset_allowed` comparisons rely on. This
// mirrors `apps/baram/scripts/setup-atomic-cap-escrow.ts`.
function typeNameVectorArg(tx: Transaction, typeStrings: string[]) {
  const elements = typeStrings.map((t) =>
    tx.moveCall({
      target: '0x1::type_name::get',
      typeArguments: [t],
    }),
  );
  return tx.makeMoveVec({
    type: '0x1::type_name::TypeName',
    elements,
  });
}

export interface AtomicAgentSetupParams {
  // Agent profile fields
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
  // Capability fields
  allowedActions: string[];
  allowedAssets: string[]; // fully-qualified Move TypeName strings
  allowedTargets: string[];
  maxNotionalPerAction: bigint;
  maxDailyLoss: bigint;
  maxSlippageBps: number;
  stopLossBps: number;
  takeProfitBps: number;
}

/**
 * Single 5-command atomic PTB that creates and links Capability,
 * AgentEscrow, and AgentProfile under one user signature:
 *
 *   Cmd 0: capability::new_capability_and_link  -> (Capability, LinkWitness)
 *   Cmd 1: escrow::new_escrow_linked(witness)   -> escrow_id (ID)
 *   Cmd 2: object::id<Capability>(&cap)         -> capability_id (ID)
 *   Cmd 3: agent_profile::create_agent_with_capability(..., capability_id, clock)
 *   Cmd 4: capability::finalize_link_and_share(cap, escrow_id)
 *
 * After execution, effects expose three created objects: Capability and
 * AgentEscrow (both shared, reciprocally bound), and AgentProfile
 * (owned by sender, capability == Some(cap_id) already set).
 *
 * Atomicity guarantee: any failure rolls back the whole PTB, so an
 * agent-runner cannot observe a transient state (e.g. profile created
 * without cap_id, or cap created without escrow_id).
 */
export function buildAtomicAgentSetupTransaction(params: AtomicAgentSetupParams): Transaction {
  validateObjectId(params.agentAddress, 'agentAddress');
  const tx = new Transaction();
  const aerPackageId = BARAM.aerPackageId;
  const capabilityRegistry = BARAM.capabilityRegistry;
  const capabilityType = `${aerPackageId}::capability::Capability`;

  // Cmd 0: create capability + emit LinkWitness.
  const [cap, witness] = tx.moveCall({
    target: `${aerPackageId}::capability::new_capability_and_link`,
    arguments: [
      tx.object(capabilityRegistry),
      tx.pure.vector('string', params.allowedActions),
      typeNameVectorArg(tx, params.allowedAssets),
      tx.pure.vector('address', params.allowedTargets),
      tx.pure.u64(params.maxNotionalPerAction),
      tx.pure.u64(params.maxDailyLoss),
      tx.pure.u16(params.maxSlippageBps),
      tx.pure.u16(params.stopLossBps),
      tx.pure.u16(params.takeProfitBps),
    ],
  });

  // Cmd 1: create AgentEscrow, consume witness.
  const escrowId = tx.moveCall({
    target: `${aerPackageId}::escrow::new_escrow_linked`,
    arguments: [witness],
  });

  // Cmd 2: read cap's ID via 0x2::object::id<Capability>(&cap).
  // This lets us pass the cap_id into create_agent_with_capability
  // without a cross-package Move dep from baram_agent to baram_aer.
  const capabilityId = tx.moveCall({
    target: `0x2::object::id`,
    typeArguments: [capabilityType],
    arguments: [cap],
  });

  // Cmd 3: create AgentProfile already linked to capability_id.
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::create_agent_with_capability`,
    arguments: [
      tx.object(BARAM.agentProfileRegistry),
      tx.pure.address(params.agentAddress),
      tx.pure.string(params.name),
      tx.pure.string(params.role),
      tx.pure.vector('string', params.capabilities),
      capabilityId,
      tx.object(SUI_CLOCK_ID),
    ],
  });

  // Cmd 4: stamp escrow_id onto cap + share cap. Must run last because
  // it consumes cap by value.
  tx.moveCall({
    target: `${aerPackageId}::capability::finalize_link_and_share`,
    arguments: [cap, escrowId],
  });

  return tx;
}

// ========== Capability mutations (wallet-signed) ==========

export type CapabilityPauseMode = 0 | 2;

/** RiskLimits shape mirrors `@nasun/baram-sdk` capability::RiskLimits but
 * kept local to avoid pulling the full SDK type surface for one struct. */
export interface CapabilityRiskLimits {
  maxNotionalPerAction: bigint;
  maxDailyLoss: bigint;
  maxSlippageBps: number;
  stopLossBps: number;
  takeProfitBps: number;
}

export function buildSetPauseModeTransaction(
  capabilityId: string,
  newMode: CapabilityPauseMode,
): Transaction {
  validateObjectId(capabilityId, 'capabilityId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::set_pause_mode`,
    arguments: [tx.object(capabilityId), tx.pure.u8(newMode)],
  });
  return tx;
}

export function buildUpdateRiskLimitsTransaction(
  capabilityId: string,
  limits: CapabilityRiskLimits,
): Transaction {
  validateObjectId(capabilityId, 'capabilityId');
  const tx = new Transaction();
  // `update_risk_limits` takes a `RiskLimits` value, which is built via
  // the `new_risk_limits` constructor. Chain the two calls in one PTB.
  const riskLimits = tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::new_risk_limits`,
    arguments: [
      tx.pure.u64(limits.maxNotionalPerAction),
      tx.pure.u64(limits.maxDailyLoss),
      tx.pure.u16(limits.maxSlippageBps),
      tx.pure.u16(limits.stopLossBps),
      tx.pure.u16(limits.takeProfitBps),
    ],
  });
  tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::update_risk_limits`,
    arguments: [tx.object(capabilityId), riskLimits],
  });
  return tx;
}

export function buildReplaceAllowedActionsTransaction(
  capabilityId: string,
  actions: string[],
): Transaction {
  validateObjectId(capabilityId, 'capabilityId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::replace_allowed_actions`,
    arguments: [tx.object(capabilityId), tx.pure.vector('string', actions)],
  });
  return tx;
}

export function buildReplaceAllowedAssetsTransaction(
  capabilityId: string,
  assetTypeNames: string[],
): Transaction {
  validateObjectId(capabilityId, 'capabilityId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::replace_allowed_assets`,
    arguments: [tx.object(capabilityId), typeNameVectorArg(tx, assetTypeNames)],
  });
  return tx;
}

export function buildReplaceAllowedTargetsTransaction(
  capabilityId: string,
  targets: string[],
): Transaction {
  validateObjectId(capabilityId, 'capabilityId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::replace_allowed_targets`,
    arguments: [tx.object(capabilityId), tx.pure.vector('address', targets)],
  });
  return tx;
}

export function buildRevokeCapabilityTransaction(capabilityId: string): Transaction {
  validateObjectId(capabilityId, 'capabilityId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.aerPackageId}::capability::revoke`,
    arguments: [tx.object(capabilityId)],
  });
  return tx;
}

// ========== Agent Profile ==========

export function buildCreateAgentTransaction(params: {
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
}): Transaction {
  validateObjectId(params.agentAddress, 'agentAddress');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::create_agent`,
    arguments: [
      tx.object(BARAM.agentProfileRegistry),
      tx.pure.address(params.agentAddress),
      tx.pure.string(params.name),
      tx.pure.string(params.role),
      tx.pure.vector('string', params.capabilities),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildDeactivateAgentTransaction(profileId: string): Transaction {
  validateObjectId(profileId, 'profileId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::deactivate_agent`,
    arguments: [tx.object(BARAM.agentProfileRegistry), tx.object(profileId)],
  });
  return tx;
}

export function buildReactivateAgentTransaction(profileId: string): Transaction {
  validateObjectId(profileId, 'profileId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::reactivate_agent`,
    arguments: [tx.object(BARAM.agentProfileRegistry), tx.object(profileId)],
  });
  return tx;
}

// ========== Request lifecycle ==========

export interface BuildRequestParams {
  coins: CoinRef[];
  promptHashBytes: number[];
  model: string;
  executorOperator: string;
  price: number;
}

export function buildCreateRequestTransaction(params: BuildRequestParams): Transaction {
  const { coins, promptHashBytes, model, executorOperator, price } = params;
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(tx.object(primary.objectId), rest.map((c) => tx.object(c.objectId)));
  }

  const [paymentCoin] = tx.splitCoins(tx.object(coins[0].objectId), [tx.pure.u64(price)]);

  tx.moveCall({
    target: `${BARAM.packageId}::baram::create_request`,
    arguments: [
      tx.object(BARAM.registry),
      paymentCoin,
      tx.pure.vector('u8', promptHashBytes),
      tx.pure.string(model),
      tx.pure.address(executorOperator),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildCancelRequestTransaction(requestId: number): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::baram::cancel_request`,
    arguments: [tx.object(BARAM.registry), tx.pure.u64(requestId), tx.object(SUI_CLOCK_ID)],
  });
  return tx;
}

// ========== Budget ==========

export interface BuildCreateBudgetParams {
  coins: CoinRef[];
  deposit: number;
  agent: string;
  maxPerRequest: number;
  allowedModels: string[];
  allowedExecutors: string[];
  expiresAt: number;
}

export function buildCreateBudgetTransaction(params: BuildCreateBudgetParams): Transaction {
  const { coins, deposit, agent, maxPerRequest, allowedModels, allowedExecutors, expiresAt } = params;
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(tx.object(primary.objectId), rest.map((c) => tx.object(c.objectId)));
  }

  const [depositCoin] = tx.splitCoins(tx.object(coins[0].objectId), [tx.pure.u64(deposit)]);

  tx.moveCall({
    target: `${BARAM.packageId}::budget::create_budget`,
    arguments: [
      depositCoin,
      tx.pure.address(agent),
      tx.pure.u64(maxPerRequest),
      tx.pure.vector('string', allowedModels),
      tx.pure.vector('address', allowedExecutors),
      tx.pure.u64(expiresAt),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildDepositToBudgetTransaction(
  budgetId: string,
  coins: CoinRef[],
  amount: number,
): Transaction {
  validateObjectId(budgetId, 'budgetId');
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(tx.object(primary.objectId), rest.map((c) => tx.object(c.objectId)));
  }

  const [depositCoin] = tx.splitCoins(tx.object(coins[0].objectId), [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${BARAM.packageId}::budget::deposit_to_budget`,
    arguments: [tx.object(budgetId), depositCoin],
  });
  return tx;
}

export function buildWithdrawFromBudgetTransaction(budgetId: string, amount: number): Transaction {
  validateObjectId(budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::withdraw_from_budget`,
    arguments: [tx.object(budgetId), tx.pure.u64(amount)],
  });
  return tx;
}

export function buildDeactivateBudgetTransaction(budgetId: string): Transaction {
  validateObjectId(budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::deactivate_budget`,
    arguments: [tx.object(budgetId)],
  });
  return tx;
}

export function buildUpdateConstraintsTransaction(params: {
  budgetId: string;
  maxPerRequest: number;
  allowedModels: string[];
  allowedExecutors: string[];
  expiresAt: number;
}): Transaction {
  validateObjectId(params.budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::update_constraints`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.u64(params.maxPerRequest),
      tx.pure.vector('string', params.allowedModels),
      tx.pure.vector('address', params.allowedExecutors),
      tx.pure.u64(params.expiresAt),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildSetSpendingLimitsTransaction(params: {
  budgetId: string;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  minIntervalMs: number;
}): Transaction {
  validateObjectId(params.budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::set_spending_limits`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.u64(params.dailyLimit),
      tx.pure.u64(params.weeklyLimit),
      tx.pure.u64(params.monthlyLimit),
      tx.pure.u64(params.minIntervalMs),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildSetCategoriesTransaction(params: {
  budgetId: string;
  allowedCategories: string[];
}): Transaction {
  validateObjectId(params.budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::set_categories`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.vector('string', params.allowedCategories),
    ],
  });
  return tx;
}

export interface DepositToAgentWalletParams {
  signerAddress: string;
  toAgentAddress: string;
  coinType: string;
  amountRaw: bigint;
  ownerCoins: CoinRef[];
}

export function buildDepositToAgentWalletTransaction(
  params: DepositToAgentWalletParams,
): Transaction {
  if (!SUI_OBJECT_ID_RE.test(params.toAgentAddress)) {
    throw new Error('Invalid agent address');
  }
  const tx = new Transaction();
  tx.setSender(params.signerAddress);
  const [primary, ...rest] = params.ownerCoins;
  if (rest.length > 0) {
    tx.mergeCoins(
      tx.object(primary.objectId),
      rest.map((c) => tx.object(c.objectId)),
    );
  }
  const [out] = tx.splitCoins(tx.object(primary.objectId), [tx.pure.u64(params.amountRaw)]);
  tx.transferObjects([out], tx.pure.address(params.toAgentAddress));
  return tx;
}
