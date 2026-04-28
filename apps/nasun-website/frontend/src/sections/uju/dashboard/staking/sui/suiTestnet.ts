// SUI mainnet read-only helpers. Plan v5+: portfolio aggregator, no signing in uju.
// File name is historical (used to be testnet); contents are now mainnet for
// consistency with ETH/SOL mainnet read-only display. Staking actions deep-link
// to suiscan / Sui Wallet on mainnet.

import { getMoveClient, formatBalance } from "@nasun/wallet";

export const SUI_MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";
// chainId is just a cache key for getMoveClient; we use a synthetic id here
// because @nasun/wallet's CHAINS only ships sui-testnet (testnet was the
// canonical Sui entry while uju supported testnet staking).
const SUI_CHAIN_KEY = "sui-mainnet";
export const SUI_DECIMALS = 9;

export function getSuiMainnetClient() {
  return getMoveClient(SUI_MAINNET_RPC, SUI_CHAIN_KEY);
}

export interface SuiValidator {
  address: string;
  name: string;
  description: string;
  imageUrl: string;
  commissionRate: number;
  apy: number;
  stakingPoolSuiBalance: bigint;
}

export interface SuiStake {
  stakedSuiId: string;
  validatorAddress: string;
  principal: bigint;
  estimatedReward?: bigint;
  status: "Active" | "Pending" | "Unstaked";
}

export async function fetchSuiValidators(): Promise<SuiValidator[]> {
  const client = getSuiMainnetClient();
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

export async function fetchSuiStakes(address: string): Promise<SuiStake[]> {
  const client = getSuiMainnetClient();
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

export async function fetchSuiBalance(address: string): Promise<bigint> {
  const client = getSuiMainnetClient();
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
