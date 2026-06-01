/**
 * Wallet-signed PTB builders for the Nasun Vault (Phase 5).
 *
 * Object/signature facts (verified against packages/nasun-vault/sources/vault.move):
 *   create_vault(factory, tier_registry, deepbook_registry, agent_profile,
 *                cap, nusdc_seed: Coin<NUSDC>, deep_seed: Coin<DEEP>,
 *                performance_fee_bps, clock) -> ID         (vault.move:274)
 *   deposit(vault, coin: Coin<NUSDC>, pool, min_shares_out, clock)  (:455)
 *   request_withdrawal(vault, shares, clock)               (:506)
 *   claim_withdrawal(vault, clock) -> (Coin<NUSDC>, Coin<NBTC>)     (:556)
 *   crystallize_fee(vault, pool, clock)                    (:737)
 *
 * Coin handling mirrors transactionBuilder.ts: merge owned coins into the
 * first ref, then splitCoins for the exact amount. The returned coins from
 * claim_withdrawal are transferred back to the signer.
 */
import { Transaction } from "@mysten/sui/transactions";
import {
  NASUN_VAULT_PACKAGE_ID,
  NASUN_VAULT_FACTORY_ID,
  NASUN_VAULT_ALLOWED_BASE_POOL_ID,
  NASUN_TIER_REGISTRY_ID,
  DEEPBOOK_REGISTRY,
} from "@nasun/devnet-config";

const SUI_CLOCK_ID = "0x6";
const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export interface CoinInput {
  objectId: string;
}

function vaultTarget(fn: string): `${string}::${string}::${string}` {
  return `${NASUN_VAULT_PACKAGE_ID}::vault::${fn}` as `${string}::${string}::${string}`;
}

function validateObjectId(id: string, label: string): void {
  if (!SUI_OBJECT_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: expected 0x + 64 hex chars`);
  }
}

// Merge all owned coins into the first object and return that ref for splitting.
function mergedPrimary(tx: Transaction, coins: CoinInput[]) {
  const [primary, ...rest] = coins;
  if (rest.length > 0) {
    tx.mergeCoins(
      tx.object(primary.objectId),
      rest.map((c) => tx.object(c.objectId)),
    );
  }
  return tx.object(primary.objectId);
}

export interface DepositParams {
  vaultId: string;
  nusdcCoins: CoinInput[];
  amountRaw: bigint; // NUSDC micro-units (6 decimals)
  minSharesOut: bigint;
}

export function buildVaultDepositTx(params: DepositParams): Transaction {
  validateObjectId(params.vaultId, "vaultId");
  if (params.nusdcCoins.length === 0) throw new Error("no NUSDC coins to deposit");
  const tx = new Transaction();
  const primary = mergedPrimary(tx, params.nusdcCoins);
  const [depositCoin] = tx.splitCoins(primary, [tx.pure.u64(params.amountRaw)]);
  tx.moveCall({
    target: vaultTarget("deposit"),
    arguments: [
      tx.object(params.vaultId),
      depositCoin,
      tx.object(NASUN_VAULT_ALLOWED_BASE_POOL_ID),
      tx.pure.u64(params.minSharesOut),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildVaultRequestWithdrawalTx(
  vaultId: string,
  shares: bigint,
): Transaction {
  validateObjectId(vaultId, "vaultId");
  const tx = new Transaction();
  tx.moveCall({
    target: vaultTarget("request_withdrawal"),
    arguments: [
      tx.object(vaultId),
      tx.pure.u64(shares),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// claim_withdrawal returns (Coin<NUSDC>, Coin<NBTC>) — transfer both to signer.
export function buildVaultClaimWithdrawalTx(
  vaultId: string,
  signerAddress: string,
): Transaction {
  validateObjectId(vaultId, "vaultId");
  const tx = new Transaction();
  const [nusdc, nbtc] = tx.moveCall({
    target: vaultTarget("claim_withdrawal"),
    arguments: [tx.object(vaultId), tx.object(SUI_CLOCK_ID)],
  });
  tx.transferObjects([nusdc, nbtc], tx.pure.address(signerAddress));
  return tx;
}

export function buildVaultCrystallizeFeeTx(vaultId: string): Transaction {
  validateObjectId(vaultId, "vaultId");
  const tx = new Transaction();
  tx.moveCall({
    target: vaultTarget("crystallize_fee"),
    arguments: [
      tx.object(vaultId),
      tx.object(NASUN_VAULT_ALLOWED_BASE_POOL_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export interface CreateVaultParams {
  agentProfileId: string;
  capabilityId: string;
  nusdcCoins: CoinInput[];
  nusdcSeedRaw: bigint;
  deepCoins: CoinInput[];
  deepSeedRaw: bigint;
  performanceFeeBps: bigint;
}

// create_vault consumes a Coin<NUSDC> and Coin<DEEP> seed by value; split each
// from the owner's coins. The vault is share_object'd inside create_vault, so
// the returned ID is left to drop (ID has drop).
export function buildCreateVaultTx(params: CreateVaultParams): Transaction {
  validateObjectId(params.agentProfileId, "agentProfileId");
  validateObjectId(params.capabilityId, "capabilityId");
  if (params.nusdcCoins.length === 0) throw new Error("no NUSDC coins for seed");
  if (params.deepCoins.length === 0) throw new Error("no DEEP coins for seed");
  const tx = new Transaction();

  const nusdcPrimary = mergedPrimary(tx, params.nusdcCoins);
  const [nusdcSeed] = tx.splitCoins(nusdcPrimary, [tx.pure.u64(params.nusdcSeedRaw)]);
  const deepPrimary = mergedPrimary(tx, params.deepCoins);
  const [deepSeed] = tx.splitCoins(deepPrimary, [tx.pure.u64(params.deepSeedRaw)]);

  tx.moveCall({
    target: vaultTarget("create_vault"),
    arguments: [
      tx.object(NASUN_VAULT_FACTORY_ID),
      tx.object(NASUN_TIER_REGISTRY_ID),
      tx.object(DEEPBOOK_REGISTRY),
      tx.object(params.agentProfileId),
      tx.object(params.capabilityId),
      nusdcSeed,
      deepSeed,
      tx.pure.u64(params.performanceFeeBps),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
