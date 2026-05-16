// Aave v3 positions configuration.
//
// Aave v3 Pool proxies are immutable per chain (governance upgrades the
// implementation behind the proxy). The list below targets the five EVM
// deployments that cover the long tail of retail DeFi users; v2 (Avalanche,
// Gnosis, Metis) is deferred to a follow-up. Source of truth:
// https://aave.com/docs/resources/addresses

import { parseAbi } from "viem";
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains";

export const AAVE_POOL_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

export interface AavePoolDeployment {
  chainId: number;
  chainLabel: string;
  address: `0x${string}`;
}

export const AAVE_POOLS: readonly AavePoolDeployment[] = [
  {
    chainId: mainnet.id,
    chainLabel: "Ethereum",
    address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  },
  {
    chainId: arbitrum.id,
    chainLabel: "Arbitrum",
    address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
  {
    chainId: base.id,
    chainLabel: "Base",
    address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  },
  {
    chainId: polygon.id,
    chainLabel: "Polygon",
    address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
  {
    chainId: optimism.id,
    chainLabel: "Optimism",
    address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
] as const;

export const AAVE_APP_URL = "https://app.aave.com";
