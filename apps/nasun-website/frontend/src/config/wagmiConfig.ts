// wagmiConfig.ts — wagmi + RainbowKit configuration for Ethereum wallet integration
// Used by WalletLayer provider for Battalion NFT wallet connection flow.
//
// 3-way connector selection:
// - MetaMask in-app browser: metaMaskWallet only (injected provider, no WC needed)
// - Other mobile browsers: walletConnectWallet only (deep-link connectors cause app-switching failures)
// - Desktop: metaMaskWallet + walletConnectWallet (EIP-6963 auto-detects Rabby, Brave, etc.)

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
if (!projectId) {
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not set. WalletConnect QR/mobile relay will not work. " +
      "Get a free project ID at https://cloud.walletconnect.com"
  );
}

const chainId = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);
const chains = chainId === 1 ? ([mainnet] as const) : ([sepolia] as const);

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
      ? [{ groupName: "Connect", wallets: [walletConnectWallet] }]
      : [{ groupName: "Connect", wallets: [metaMaskWallet, walletConnectWallet] }],
  { appName: "Nasun", projectId: projectId || "" }
);

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
