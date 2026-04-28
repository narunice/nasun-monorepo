// Sui testnet read-only helpers. Plan v5: portfolio aggregator (no signing in uju).
// Transaction-related constants and parsers were removed — staking actions now
// deep-link to suiscan / Sui Wallet.

import { CHAINS, getMoveClient, formatBalance } from "@nasun/wallet";

export const SUI_TESTNET_CHAIN_ID = "sui-testnet";
export const SUI_TESTNET_RPC = CHAINS[SUI_TESTNET_CHAIN_ID].rpcUrl;
export const SUI_TESTNET_FAUCET_URL = "https://faucet.testnet.sui.io";
export const SUI_DECIMALS = 9;

export function getSuiTestnetClient() {
  return getMoveClient(SUI_TESTNET_RPC, SUI_TESTNET_CHAIN_ID);
}

export interface SuiValidator {
  address: string;
  name: string;
  description: string;
  imageUrl: string;
  commissionRate: number; // 0..1
  apy: number;            // 0..1 (e.g. 0.035 = 3.5%)
  stakingPoolSuiBalance: bigint;
}

export interface SuiStake {
  stakedSuiId: string;
  validatorAddress: string;
  principal: bigint;
  estimatedReward?: bigint;
  status: "Active" | "Pending" | "Unstaked";
}

export async function fetchSuiTestnetValidators(): Promise<SuiValidator[]> {
  const client = getSuiTestnetClient();
  const [systemState, validatorsApy] = await Promise.all([
    client.getLatestSuiSystemState(),
    client.getValidatorsApy(),
  ]);

  const apyMap = new Map<string, number>();
  for (const a of validatorsApy.apys) apyMap.set(a.address, a.apy);

  return systemState.activeValidators
    .map((v) => ({
      address: v.suiAddress,
      name: v.name,
      description: v.description,
      imageUrl: v.imageUrl,
      commissionRate: Number(v.commissionRate) / 10000,
      apy: apyMap.get(v.suiAddress) ?? 0,
      stakingPoolSuiBalance: BigInt(v.stakingPoolSuiBalance),
    }))
    .sort((a, b) => b.apy - a.apy);
}

export async function fetchSuiTestnetStakes(address: string): Promise<SuiStake[]> {
  const client = getSuiTestnetClient();
  const groups = await client.getStakes({ owner: address });

  const stakes: SuiStake[] = [];
  for (const g of groups) {
    for (const s of g.stakes) {
      stakes.push({
        stakedSuiId: s.stakedSuiId,
        validatorAddress: g.validatorAddress,
        principal: BigInt(s.principal),
        estimatedReward:
          "estimatedReward" in s && s.estimatedReward != null
            ? BigInt(s.estimatedReward as string)
            : undefined,
        status: s.status as SuiStake["status"],
      });
    }
  }
  return stakes;
}

export async function fetchSuiTestnetBalance(address: string): Promise<bigint> {
  const client = getSuiTestnetClient();
  const { totalBalance } = await client.getBalance({ owner: address });
  return BigInt(totalBalance);
}

export function formatSui(amount: bigint | string): string {
  return formatBalance(amount.toString(), SUI_DECIMALS);
}

export function shortValidator(name: string, max = 28): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}
