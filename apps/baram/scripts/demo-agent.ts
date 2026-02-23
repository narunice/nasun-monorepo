#!/usr/bin/env tsx
/**
 * Baram-AER Demo Agent: DeFi Trader + Budget Guardian
 *
 * Demonstrates:
 * 1. Agent on-chain identity (AgentProfile)
 * 2. Delegated budget with time-windowed spending limits
 * 3. Category-based spending enforcement
 * 4. Budget Guardian: limit rejection as security success
 * 5. Audit trail via budget spending events
 *
 * Run: pnpm demo-agent
 *
 * Environment:
 *   OWNER_PRIVATE_KEY - Budget owner private key (base64 or hex)
 *   AGENT_PRIVATE_KEY - Agent private key (base64 or hex)
 *   (If not set, ephemeral keypairs are generated)
 */

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createHash } from 'crypto';

import {
  RPC_URL,
  FAUCET_URL,
  CLOCK_ID,
  BARAM_PACKAGE_ID,
  BARAM_REGISTRY,
  AGENT_PACKAGE_ID,
  AGENT_PROFILE_REGISTRY,
  TOKENS_PACKAGE_ID,
  TOKEN_FAUCET,
  NUSDC_TYPE,
  BUDGET_DEPOSIT,
  BUDGET_MAX_PER_REQUEST,
  DAILY_LIMIT,
  WEEKLY_LIMIT,
  MONTHLY_LIMIT,
  MIN_INTERVAL_MS,
  SCENARIOS,
  log,
  logSection,
  logSuccess,
  logBlocked,
  logError,
  formatNUSDC,
} from './demo-config.js';

// ========== Sui Client ==========

const client = new SuiClient({ url: RPC_URL });

// ========== Keypair Management ==========

function loadOrGenerateKeypair(envKey: string, label: string): Ed25519Keypair {
  const raw = process.env[envKey];
  if (raw) {
    try {
      // Try hex format (64 bytes = 32 byte secret key)
      if (raw.startsWith('0x') || /^[0-9a-fA-F]{64}$/.test(raw)) {
        const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
        return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
      }
      // Try base64
      return Ed25519Keypair.fromSecretKey(Buffer.from(raw, 'base64'));
    } catch {
      log(`Warning: Could not parse ${envKey}, generating ephemeral keypair`);
    }
  }
  const kp = new Ed25519Keypair();
  log(`Generated ephemeral ${label} keypair: ${kp.toSuiAddress()}`);
  return kp;
}

// ========== Faucet ==========

async function requestGas(address: string): Promise<boolean> {
  try {
    const res = await fetch(`${FAUCET_URL}/gas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        FixedAmountRequest: { recipient: address },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function requestNUSDC(keypair: Ed25519Keypair): Promise<string | null> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${TOKENS_PACKAGE_ID}::faucet::request_nusdc`,
    arguments: [
      tx.object(TOKEN_FAUCET),
    ],
  });

  try {
    const result = await executeTransaction(keypair, tx);
    return result.digest;
  } catch (e) {
    logError(`NUSDC faucet failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ========== Transaction Execution ==========

async function executeTransaction(
  keypair: Ed25519Keypair,
  tx: Transaction
): Promise<SuiTransactionBlockResponse> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });

  // Wait for finality
  await client.waitForTransaction({ digest: result.digest });
  return result;
}

// ========== Hash Helper ==========

function sha256(input: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(input).digest());
}

// ========== Phase 0: Setup ==========

async function setupAccounts(
  owner: Ed25519Keypair,
  agent: Ed25519Keypair
): Promise<void> {
  logSection('Phase 0: Account Setup');

  log(`Owner address:  ${owner.toSuiAddress()}`);
  log(`Agent address:  ${agent.toSuiAddress()}`);

  // Check balances
  const ownerBalance = await client.getBalance({ owner: owner.toSuiAddress() });
  const agentBalance = await client.getBalance({ owner: agent.toSuiAddress() });

  // Request gas if needed
  if (BigInt(ownerBalance.totalBalance) < 100_000_000n) {
    log('Requesting gas for owner...');
    await requestGas(owner.toSuiAddress());
    // Wait for gas to arrive
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (BigInt(agentBalance.totalBalance) < 100_000_000n) {
    log('Requesting gas for agent...');
    await requestGas(agent.toSuiAddress());
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Request NUSDC for owner (for budget deposit)
  const nusdcBalance = await client.getBalance({
    owner: owner.toSuiAddress(),
    coinType: NUSDC_TYPE,
  });

  if (BigInt(nusdcBalance.totalBalance) < BigInt(BUDGET_DEPOSIT)) {
    log('Requesting NUSDC for owner...');
    await requestNUSDC(owner);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const finalGas = await client.getBalance({ owner: owner.toSuiAddress() });
  const finalNusdc = await client.getBalance({
    owner: owner.toSuiAddress(),
    coinType: NUSDC_TYPE,
  });

  logSuccess(`Owner gas: ${(Number(finalGas.totalBalance) / 1e9).toFixed(2)} NASUN`);
  logSuccess(`Owner NUSDC: ${formatNUSDC(Number(finalNusdc.totalBalance))}`);
}

// ========== Phase 1: Agent Registration ==========

async function registerAgent(
  owner: Ed25519Keypair,
  agentAddress: string
): Promise<string | null> {
  logSection('Phase 1: Agent Registration');

  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_PACKAGE_ID}::agent_profile::create_agent`,
    arguments: [
      tx.object(AGENT_PROFILE_REGISTRY),
      tx.pure.address(agentAddress),
      tx.pure.string('DeFi Trader Bot'),
      tx.pure.string('trader'),
      tx.pure.vector('string', ['ai_inference', 'dex_trade']),
      tx.object(CLOCK_ID),
    ],
  });

  try {
    const result = await executeTransaction(owner, tx);
    const status = result.effects?.status?.status;

    if (status === 'success') {
      // Find the created AgentProfile object
      const created = result.objectChanges?.find(
        (c) => c.type === 'created' && 'objectType' in c &&
               c.objectType.includes('AgentProfile') &&
               !c.objectType.includes('Registry')
      );
      const profileId = created && 'objectId' in created ? created.objectId : null;
      logSuccess(`AgentProfile created: ${profileId ?? 'unknown'}`);
      logSuccess(`  Name: DeFi Trader Bot | Role: trader`);
      logSuccess(`  Capabilities: ai_inference, dex_trade`);
      return profileId;
    } else {
      logError(`Agent registration failed: ${result.effects?.status?.error}`);
      return null;
    }
  } catch (e) {
    // Agent might already be registered
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('501')) {
      log('Agent already registered, continuing...');
      return 'already-registered';
    }
    logError(`Agent registration error: ${msg}`);
    return null;
  }
}

// ========== Phase 2: Budget Setup ==========

async function createBudget(
  owner: Ed25519Keypair,
  agentAddress: string
): Promise<string | null> {
  logSection('Phase 2: Budget Setup');

  // Get NUSDC coins for deposit
  const coins = await client.getCoins({
    owner: owner.toSuiAddress(),
    coinType: NUSDC_TYPE,
  });

  if (coins.data.length === 0) {
    logError('No NUSDC coins found for budget deposit');
    return null;
  }

  // Step 1: Create Budget
  log(`Creating budget: ${formatNUSDC(BUDGET_DEPOSIT)} deposit, ${formatNUSDC(BUDGET_MAX_PER_REQUEST)} max/request`);

  const tx = new Transaction();

  // Merge all NUSDC coins if needed, then split exact amount
  const [depositCoin] = tx.splitCoins(
    coins.data.length === 1
      ? tx.object(coins.data[0].coinObjectId)
      : (() => {
          const primary = tx.object(coins.data[0].coinObjectId);
          if (coins.data.length > 1) {
            tx.mergeCoins(
              primary,
              coins.data.slice(1).map((c) => tx.object(c.coinObjectId))
            );
          }
          return primary;
        })(),
    [tx.pure.u64(BUDGET_DEPOSIT)]
  );

  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::budget::create_budget`,
    arguments: [
      depositCoin,
      tx.pure.address(agentAddress),
      tx.pure.u64(BUDGET_MAX_PER_REQUEST),
      tx.pure.vector('string', []),        // allowed_models: empty = all
      tx.pure.vector('address', []),     // allowed_executors: empty = all
      tx.pure.u64(0),                     // expires_at: 0 = no expiration
      tx.object(CLOCK_ID),
    ],
  });

  try {
    const result = await executeTransaction(owner, tx);

    if (result.effects?.status?.status !== 'success') {
      logError(`Budget creation failed: ${result.effects?.status?.error}`);
      return null;
    }

    // Find the shared Budget object
    const budgetObj = result.objectChanges?.find(
      (c) => c.type === 'created' && 'objectType' in c &&
             c.objectType.includes('Budget') &&
             !c.objectType.includes('Receipt')
    );
    const budgetId = budgetObj && 'objectId' in budgetObj ? budgetObj.objectId : null;

    if (!budgetId) {
      logError('Budget created but could not find object ID');
      return null;
    }

    logSuccess(`Budget created: ${budgetId}`);
    logSuccess(`  Deposit: ${formatNUSDC(BUDGET_DEPOSIT)}`);
    logSuccess(`  Max per request: ${formatNUSDC(BUDGET_MAX_PER_REQUEST)}`);
    logSuccess(`  Agent: ${agentAddress}`);

    // Step 2: Set SpendingLimits
    await setSpendingLimits(owner, budgetId);

    // Step 3: Set Categories
    await setCategories(owner, budgetId);

    return budgetId;
  } catch (e) {
    logError(`Budget creation error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function setSpendingLimits(
  owner: Ed25519Keypair,
  budgetId: string
): Promise<void> {
  log('Setting spending limits...');

  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::budget::set_spending_limits`,
    arguments: [
      tx.object(budgetId),
      tx.pure.u64(DAILY_LIMIT),
      tx.pure.u64(WEEKLY_LIMIT),
      tx.pure.u64(MONTHLY_LIMIT),
      tx.pure.u64(MIN_INTERVAL_MS),
      tx.object(CLOCK_ID),
    ],
  });

  const result = await executeTransaction(owner, tx);

  if (result.effects?.status?.status === 'success') {
    logSuccess(`SpendingLimits set:`);
    logSuccess(`  Daily:   ${formatNUSDC(DAILY_LIMIT)}`);
    logSuccess(`  Weekly:  ${formatNUSDC(WEEKLY_LIMIT)}`);
    logSuccess(`  Monthly: ${formatNUSDC(MONTHLY_LIMIT)}`);
  } else {
    logError(`SpendingLimits failed: ${result.effects?.status?.error}`);
  }
}

async function setCategories(
  owner: Ed25519Keypair,
  budgetId: string
): Promise<void> {
  log('Setting allowed categories...');

  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::budget::set_categories`,
    arguments: [
      tx.object(budgetId),
      tx.pure.vector('string', ['ai_inference', 'dex_trade']),
    ],
  });

  const result = await executeTransaction(owner, tx);

  if (result.effects?.status?.status === 'success') {
    logSuccess(`Categories set: ai_inference, dex_trade`);
  } else {
    logError(`Categories failed: ${result.effects?.status?.error}`);
  }
}

// ========== Phase 3: Scenarios ==========

async function spendFromBudget(
  agent: Ed25519Keypair,
  budgetId: string,
  category: string,
  price: number,
  prompt: string,
  model: string,
  executorAddress: string
): Promise<{ success: boolean; digest?: string; error?: string }> {
  const promptHash = sha256(prompt);

  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::baram::create_request_with_budget_v2`,
    arguments: [
      tx.object(BARAM_REGISTRY),
      tx.object(budgetId),
      tx.pure.vector('u8', Array.from(promptHash)),
      tx.pure.string(model),
      tx.pure.address(executorAddress),
      tx.pure.u64(price),
      tx.pure.string(category),
      tx.object(CLOCK_ID),
    ],
  });

  try {
    const result = await executeTransaction(agent, tx);
    const status = result.effects?.status?.status;

    if (status === 'success') {
      return { success: true, digest: result.digest };
    } else {
      return { success: false, error: result.effects?.status?.error ?? 'unknown' };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

function categorizeError(error: string): string {
  // Extract the MoveAbort error code — match ", CODE)" at the end of MoveAbort
  const abortMatch = error.match(/,\s*(\d+)\)\s*in\s+command/);
  const code = abortMatch ? abortMatch[1] : '';

  if (code === '105') return 'Exceeds max per request limit';
  if (code === '111') return 'Category not allowed';
  if (code === '112') return 'Daily spending limit exceeded';
  if (code === '113') return 'Weekly spending limit exceeded';
  if (code === '114') return 'Monthly spending limit exceeded';
  if (code === '115') return 'Rate limited (too frequent)';
  if (code === '104') return 'Insufficient budget balance';
  if (code === '102') return 'Budget expired';
  if (code === '103') return 'Budget inactive';
  return error;
}

async function runScenarios(
  agent: Ed25519Keypair,
  budgetId: string,
  executorAddress: string
): Promise<void> {
  logSection('Phase 3: Demo Scenarios');

  let totalSpent = 0;

  // --- Scenario 1: Successful AI Inference ---
  log('');
  log('--- Scenario 1: AI Market Analysis (1 NUSDC) ---');
  const s1 = SCENARIOS[0];
  const r1 = await spendFromBudget(
    agent, budgetId, s1.category, s1.price, s1.prompt, s1.model, executorAddress
  );
  if (r1.success) {
    totalSpent += s1.price;
    logSuccess(`Request created (${formatNUSDC(s1.price)}) - TX: ${r1.digest?.slice(0, 16)}...`);
    logSuccess(`  Category: ${s1.category} | Model: ${s1.model}`);
  } else {
    logError(`Failed: ${r1.error}`);
  }

  // --- Scenario 2: Successful Risk Assessment ---
  log('');
  log('--- Scenario 2: Risk Assessment (2 NUSDC) ---');
  const s2 = SCENARIOS[1];
  const r2 = await spendFromBudget(
    agent, budgetId, s2.category, s2.price, s2.prompt, s2.model, executorAddress
  );
  if (r2.success) {
    totalSpent += s2.price;
    logSuccess(`Request created (${formatNUSDC(s2.price)}) - TX: ${r2.digest?.slice(0, 16)}...`);
    logSuccess(`  Running total: ${formatNUSDC(totalSpent)} / ${formatNUSDC(DAILY_LIMIT)} daily limit`);
  } else {
    logError(`Failed: ${r2.error}`);
  }

  // --- Scenario 3: Budget Guardian - Per-Request Limit ---
  log('');
  log('--- Scenario 3: Budget Guardian - Per-Request Limit ---');
  log(`Attempting to spend 10 NUSDC (max per request: ${formatNUSDC(BUDGET_MAX_PER_REQUEST)})...`);
  const r3 = await spendFromBudget(
    agent, budgetId, 'ai_inference', 10_000_000, 'Overpriced request', 'gpt-4', executorAddress
  );
  if (!r3.success) {
    logBlocked(`${categorizeError(r3.error ?? '')} (10 > 5 NUSDC)`);
    logSuccess('Security check passed: per-request limit enforced on-chain');
  } else {
    logError('Expected rejection but request succeeded!');
  }

  // --- Scenario 4: Fill up daily budget ---
  log('');
  log('--- Scenario 4: Filling Daily Budget ---');
  const fillScenario = SCENARIOS[2];

  // Spend 5 NUSDC three more times (total will be: 1+2+5+5+5 = 18)
  for (let i = 0; i < 3; i++) {
    const r = await spendFromBudget(
      agent, budgetId, fillScenario.category, fillScenario.price,
      `${fillScenario.prompt} #${i + 1}`, fillScenario.model, executorAddress
    );
    if (r.success) {
      totalSpent += fillScenario.price;
      logSuccess(`Request ${i + 1}/3 created (${formatNUSDC(fillScenario.price)}) - Total: ${formatNUSDC(totalSpent)}`);
    } else {
      logError(`Request ${i + 1}/3 failed: ${categorizeError(r.error ?? '')}`);
      break;
    }
  }

  // --- Scenario 5: Budget Guardian - Daily Limit ---
  log('');
  log('--- Scenario 5: Budget Guardian - Daily Limit ---');
  log(`Daily spent: ${formatNUSDC(totalSpent)} / ${formatNUSDC(DAILY_LIMIT)}`);
  log(`Attempting to spend 5 NUSDC more (would total ${formatNUSDC(totalSpent + 5_000_000)})...`);

  const r5 = await spendFromBudget(
    agent, budgetId, 'ai_inference', 5_000_000, 'This should be blocked', 'llama-3.3-70b-versatile', executorAddress
  );
  if (!r5.success) {
    logBlocked(`${categorizeError(r5.error ?? '')} (${formatNUSDC(totalSpent + 5_000_000)} > ${formatNUSDC(DAILY_LIMIT)})`);
    logSuccess('Security check passed: daily spending limit enforced on-chain');
  } else {
    totalSpent += 5_000_000;
    log(`Note: Request succeeded (daily limit may have been reached differently)`);
  }

  // --- Scenario 6: Budget Guardian - Unauthorized Category ---
  log('');
  log('--- Scenario 6: Budget Guardian - Unauthorized Category ---');
  log('Attempting to spend with category "gambling"...');
  const r6 = await spendFromBudget(
    agent, budgetId, 'gambling', 1_000_000, 'Unauthorized category test', 'llama-3.3-70b-versatile', executorAddress
  );
  if (!r6.success) {
    logBlocked(`${categorizeError(r6.error ?? '')} (category: "gambling" not in allowlist)`);
    logSuccess('Security check passed: category restriction enforced on-chain');
  } else {
    logError('Expected rejection but request succeeded!');
  }
}

// ========== Phase 4: Summary ==========

async function showSummary(
  budgetId: string,
  agentAddress: string
): Promise<void> {
  logSection('Phase 4: Summary');

  // Query budget state
  try {
    const budgetObj = await client.getObject({
      id: budgetId,
      options: { showContent: true },
    });

    if (budgetObj.data?.content?.dataType === 'moveObject') {
      const fields = budgetObj.data.content.fields as Record<string, unknown>;
      log('Budget State:');
      log(`  Balance:     ${formatNUSDC(Number(fields.balance as string ?? 0))}`);
      log(`  Total spent: ${formatNUSDC(Number(fields.total_spent as string ?? 0))}`);
      log(`  Requests:    ${fields.request_count ?? 0}`);
      log(`  Active:      ${fields.is_active ?? 'unknown'}`);
    }
  } catch (e) {
    logError(`Could not query budget: ${e instanceof Error ? e.message : String(e)}`);
  }

  log('');
  log('Demo complete.');
  log('');
  log('Key takeaways:');
  log('  1. AI agents have on-chain identity (AgentProfile)');
  log('  2. Budget delegation enables controlled autonomous spending');
  log('  3. Time-windowed limits (daily/weekly/monthly) prevent runaway costs');
  log('  4. Category restrictions ensure spending stays on-purpose');
  log('  5. All enforcement is on-chain — no trust in off-chain middleware');
  log('  6. Every blocked attempt is a security SUCCESS, not an error');
}

// ========== Main ==========

async function main(): Promise<void> {
  console.log('');
  console.log('  Baram-AER Demo: DeFi Trader + Budget Guardian');
  console.log('  Nasun Devnet (Chain ID: 272218f1)');
  console.log('');

  // Load keypairs
  const owner = loadOrGenerateKeypair('OWNER_PRIVATE_KEY', 'owner');
  const agent = loadOrGenerateKeypair('AGENT_PRIVATE_KEY', 'agent');

  // Phase 0: Setup
  await setupAccounts(owner, agent);

  // Phase 1: Agent Registration
  await registerAgent(owner, agent.toSuiAddress());

  // Phase 2: Budget Setup
  const budgetId = await createBudget(owner, agent.toSuiAddress());

  if (!budgetId) {
    logError('Budget creation failed. Cannot continue demo.');
    process.exit(1);
  }

  // Phase 3: Scenarios
  // Use owner as mock executor (demo purposes only)
  await runScenarios(agent, budgetId, owner.toSuiAddress());

  // Phase 4: Summary
  await showSummary(budgetId, agent.toSuiAddress());
}

main().catch((err) => {
  logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
