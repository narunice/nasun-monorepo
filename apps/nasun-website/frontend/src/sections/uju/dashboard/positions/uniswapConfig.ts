// Uniswap V3 positions configuration.
//
// Reads the user's LP positions directly from the NonfungiblePositionManager
// contract on Ethereum mainnet — no subgraph, no API key. wagmi's mainnet
// transport (Alchemy primary + public RPC fallback) handles routing.
//
// Position lifecycle: an LP NFT is minted when the user adds liquidity, and
// remains in the user's wallet even after liquidity is removed. We count
// "active" positions by checking liquidity > 0 — positions with zero
// liquidity are closed and not surfaced.

import { mainnet } from "wagmi/chains";
import { parseAbi } from "viem";

export const UNISWAP_POSITIONS_CHAIN_ID = mainnet.id;

// Canonical NonfungiblePositionManager (V3) on Ethereum mainnet.
// https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
export const NPM_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as const;

// Minimal ABI: only the three calls we need. Avoids pulling the full Uniswap
// SDK just to count positions.
export const NPM_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

// Hard cap to keep multicalls bounded for users with very large position
// counts. 50 LP NFTs is well above the 99th percentile retail wallet.
export const MAX_POSITIONS_PER_QUERY = 50;
