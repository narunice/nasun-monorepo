// Hyperliquid positions configuration.
//
// Reads the user's perp positions and spot balances directly from the
// Hyperliquid public /info endpoint. No API key, no SDK, no Alchemy —
// Hyperliquid identifies users by their EVM address (HyperCore native
// state, not HyperEVM contracts), so we just POST the verified address
// from useValidEvmAddress.
//
// Public per-IP rate limit applies; the consuming hook uses a 5-minute
// staleTime and disables refetchOnWindowFocus to stay well under it.

export const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

// Public portfolio link uses the user's EVM address as a query param.
export const HYPERLIQUID_PORTFOLIO_URL = "https://app.hyperliquid.xyz/portfolio";
