/**
 * Vault cycle driver -- one tick of an agent managing a Nasun Vault.
 *
 * Called from run-cycle.ts when PRESET=vault. Unlike the trader cycle this
 * path signs the trade PTB directly with the agent keypair (the vault's
 * execute_trade requires sender == vault.agent_address; see vault-trade.ts
 * header). It does not touch the budget / AER / escrow flow.
 *
 * Flow: read vault state -> authorize -> quote reference -> decide ->
 * (HOLD: return) -> size + cap-check -> build PTB -> dry-run or sign+exec.
 */

import type { SuiClient } from '@mysten/sui/client';

import { log } from '../logger.js';
import { requestShutdown } from '../lifecycle.js';
import type { Config } from '../config.js';
import { fetchCapabilityFields } from '../presets/trader-cycle.js';
import {
  readVaultState,
  quoteReferenceRaw,
  decideVaultTrade,
  computeOrderParams,
  buildExecuteTradeTx,
  dryRunVaultTrade,
  executeVaultTrade,
} from '../presets/vault-trade.js';

const TRADE_EXPIRY_MS = 120_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Rolling-24h notional spent, in NUSDC micro-units. Process-local (resets on
// restart, like the trader preset's tradeHistory). Only LIVE fills are
// recorded; dry-run cycles move no funds.
interface VaultTradeRecord {
  ts: number;
  notionalRaw: bigint;
}
const vaultTradeHistory: VaultTradeRecord[] = [];

function dailySpentNotionalRaw(now: number): bigint {
  const cutoff = now - DAY_MS;
  let sum = 0n;
  for (const r of vaultTradeHistory) if (r.ts >= cutoff) sum += r.notionalRaw;
  return sum;
}

export async function runVaultCyclePresetEntry(
  client: SuiClient,
  config: Config,
): Promise<number | undefined> {
  const vault = config.vault;
  if (!vault) {
    log('[vault] No vault config; refusing to run. Set PRESET=vault + VAULT_ID.');
    requestShutdown();
    return undefined;
  }

  let state;
  try {
    state = await readVaultState(client, vault.vaultId);
  } catch (err) {
    log(`[vault] readVaultState failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined; // transient; retry next cycle
  }

  // Fatal misconfig: this runtime's key is not the vault's authorized agent.
  // The on-chain ENotManager would abort every trade, so stop rather than burn
  // cycles. (Manager can rotate us in via set_agent_address.)
  if (
    state.agentAddress.toLowerCase() !== config.agentAddress.toLowerCase() &&
    state.managerAddress.toLowerCase() !== config.agentAddress.toLowerCase()
  ) {
    log(
      `[vault] FATAL: runtime ${config.agentAddress} is neither agent (${state.agentAddress}) ` +
        `nor manager (${state.managerAddress}) of vault ${vault.vaultId}. Stopping.`,
    );
    requestShutdown();
    return undefined;
  }

  // The per-cycle on-chain is_active kill switch (index.ts) watches
  // config.vault.agentProfileId. If that env points at a different profile
  // than the vault's own agent_profile_id, the kill switch is watching the
  // wrong object and a user "kill" would not stop this loop. Refuse to run.
  if (vault.agentProfileId.toLowerCase() !== state.agentProfileId.toLowerCase()) {
    log(
      `[vault] FATAL: AGENT_PROFILE_ID ${vault.agentProfileId} != vault.agent_profile_id ` +
        `${state.agentProfileId}; the on-chain kill switch would watch the wrong profile. Stopping.`,
    );
    requestShutdown();
    return undefined;
  }

  let refPriceRaw: bigint;
  let version: string;
  try {
    [refPriceRaw, { version }] = await Promise.all([
      quoteReferenceRaw(client),
      fetchCapabilityFields(client, state.capabilityId),
    ]);
  } catch (err) {
    log(`[vault] quote/cap read failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }

  const decision = decideVaultTrade({
    isKilled: state.isKilled,
    lastMarkRaw: state.lastMarkRaw,
    refPriceRaw,
    bandBps: vault.bandBps,
    allowSell: vault.allowSell,
  });

  log(
    `[vault] mark=${state.lastMarkRaw} ref=${refPriceRaw} -> ${decision.action} ` +
      `(${decision.deviationBps}bps; ${decision.reason})`,
  );
  if (decision.action === 'HOLD') return undefined;

  const order = computeOrderParams({
    action: decision.action,
    refPriceRaw,
    slippageBps: vault.slippageBps,
    stepQtyRaw: vault.stepQtyRaw,
  });

  if (order.qtyRaw <= 0n) {
    log(`[vault] computed qty 0 (step ${vault.stepQtyRaw} < lot). Skipping.`);
    return undefined;
  }
  if (order.priceRaw <= 0n) {
    log(`[vault] computed price 0 (slippage too high). Skipping.`);
    return undefined;
  }
  if (order.notionalRaw > vault.maxNotionalRaw) {
    log(
      `[vault] notional ${order.notionalRaw} > per-trade cap ${vault.maxNotionalRaw}. Skipping (would abort on-chain).`,
    );
    return undefined;
  }

  const tx = buildExecuteTradeTx({
    vaultId: vault.vaultId,
    capabilityId: state.capabilityId,
    poolId: state.poolId,
    expectedCapVersion: BigInt(version),
    isBid: order.isBid,
    priceRaw: order.priceRaw,
    qtyRaw: order.qtyRaw,
    expireTsMs: BigInt(Date.now() + TRADE_EXPIRY_MS),
  });

  if (vault.dryRun) {
    const res = await dryRunVaultTrade(client, config.agentAddress, tx);
    if (!res.ok) {
      log(`[vault] DRY-RUN ABORT: ${res.error}`);
    } else {
      log(
        `[vault] DRY-RUN OK: ${decision.action} price=${order.priceRaw} qty=${order.qtyRaw} ` +
          `notional=${order.notionalRaw} capV=${version} event=${JSON.stringify(res.event ?? {})}`,
      );
    }
    return undefined;
  }

  const now = Date.now();
  const spent = dailySpentNotionalRaw(now);
  if (spent + order.notionalRaw > vault.dailyMaxNotionalRaw) {
    log(
      `[vault] daily notional cap: spent ${spent} + ${order.notionalRaw} > ` +
        `${vault.dailyMaxNotionalRaw}. Skipping until window rolls.`,
    );
    return undefined;
  }

  try {
    const r = await executeVaultTrade(client, config.keypair, tx);
    vaultTradeHistory.push({ ts: now, notionalRaw: order.notionalRaw });
    log(
      `[vault] ${decision.action} executed: digest=${r.digest} filledQty=${r.executedQty} ` +
        `fillNotional=${r.fillNotional} navAfter=${r.navAfter}`,
    );
  } catch (err) {
    log(`[vault] execute_trade failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return undefined;
}
