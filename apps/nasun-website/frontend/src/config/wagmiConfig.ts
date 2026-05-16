// wagmiConfig.ts -- wagmi + RainbowKit configuration for Ethereum wallet integration
// Used by WalletLayer provider for EVM wallet linking and Battalion NFT flow.
//
// 3-way connector selection:
// - MetaMask in-app browser: metaMaskWallet only (injected provider, no WC needed)
// - Mobile browsers: metaMaskWallet only (MetaMask SDK deep link protocol)
// - Desktop: metaMaskWallet + rainbowWallet + trustWallet + walletConnectWallet

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, fallback } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon, sepolia } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
if (!projectId) {
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not set. WalletConnect QR/mobile relay will not work. " +
      "Get a free project ID at https://cloud.reown.com"
  );
}

const alchemyKey = import.meta.env.VITE_ALCHEMY_API_KEY;

// Always include mainnet so Genesis Pass ownership/drop hooks can read it
// regardless of VITE_ETHEREUM_CHAIN_ID (which drives MetaMask auth default).
const chainId = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);
// Multi-chain read transports (Aave v3 spans mainnet + arbitrum/base/polygon/optimism).
// MetaMask auth still defaults to mainnet/sepolia; the extra chains are read-only.
const chains =
  chainId === 1
    ? ([mainnet, arbitrum, base, polygon, optimism] as const)
    : ([mainnet, sepolia, arbitrum, base, polygon, optimism] as const);

const isMobile =
  typeof window !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// MetaMask in-app dApp browser injects window.ethereum and includes "MetaMask" in UA
const isMetaMaskInApp =
  typeof window !== "undefined" &&
  Boolean((window as { ethereum?: unknown }).ethereum) &&
  /MetaMask/i.test(navigator.userAgent);

const connectors = connectorsForWallets(
  isMetaMaskInApp
    ? [{ groupName: "Connect", wallets: [metaMaskWallet] }]
    : isMobile
      ? [{ groupName: "Connect", wallets: [metaMaskWallet] }]
      : [{ groupName: "Connect", wallets: [metaMaskWallet, rainbowWallet, trustWallet, walletConnectWallet] }],
  { appName: "Nasun", projectId: projectId || "" }
);

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: {
    // Alchemy is intentionally last (safety net) to minimize paid CU consumption.
    // viem fallback tries transports in order; Alchemy is only hit when every public RPC fails.
    [mainnet.id]: fallback([
      http("https://cloudflare-eth.com"),
      http("https://eth.merkle.io"),
      http("https://eth.drpc.org"),
      http("https://rpc.mevblocker.io"),
      ...(alchemyKey ? [http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
    ]),
    [sepolia.id]: fallback([
      http("https://ethereum-sepolia-rpc.publicnode.com"),
      http("https://sepolia.drpc.org"),
      http("https://1rpc.io/sepolia"),
      http("https://rpc.sepolia.org"),
      ...(alchemyKey ? [http(`https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`)] : []),
    ]),
    [arbitrum.id]: fallback([
      http("https://arbitrum-one-rpc.publicnode.com"),
      http("https://arb1.arbitrum.io/rpc"),
      http("https://arbitrum.drpc.org"),
      http("https://1rpc.io/arb"),
      ...(alchemyKey ? [http(`https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
    ]),
    [base.id]: fallback([
      http("https://base-rpc.publicnode.com"),
      http("https://mainnet.base.org"),
      http("https://base.drpc.org"),
      http("https://1rpc.io/base"),
      ...(alchemyKey ? [http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
    ]),
    [polygon.id]: fallback([
      http("https://polygon-bor-rpc.publicnode.com"),
      http("https://polygon-rpc.com"),
      http("https://polygon.drpc.org"),
      http("https://1rpc.io/matic"),
      ...(alchemyKey ? [http(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
    ]),
    [optimism.id]: fallback([
      http("https://optimism-rpc.publicnode.com"),
      http("https://mainnet.optimism.io"),
      http("https://optimism.drpc.org"),
      http("https://1rpc.io/op"),
      ...(alchemyKey ? [http(`https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
    ]),
  },
});
