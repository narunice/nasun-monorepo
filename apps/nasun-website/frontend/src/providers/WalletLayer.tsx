// Lazy-loaded wallet layer — keeps @nasun/wallet, @nasun/wallet-ui, @mysten/dapp-kit,
// and wagmi/RainbowKit out of the initial bundle.
// Downloaded on-demand after the app shell renders.

import type { ReactNode } from "react";
import { configureWallet, initZkLogin, configureClearSigning, setFormatterConfig, configurePortfolio } from "@nasun/wallet";
import { createContractRegistry } from "@nasun/devnet-config";
import { WalletProvider } from "@nasun/wallet-ui";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "../config/wagmiConfig";
import { NasunProvider } from "./NasunProvider";
import "@rainbow-me/rainbowkit/styles.css";

// Initialize wallet config (runs once when this chunk loads)
configureWallet({
  rpcUrl: import.meta.env.VITE_NASUN_RPC_URL || "https://rpc.devnet.nasun.io",
  faucetUrl:
    import.meta.env.VITE_NASUN_FAUCET_URL || "https://faucet.devnet.nasun.io",
  networkName: "Nasun Devnet",
  sessionPersist: true,
});

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const saltApiUrl = import.meta.env.VITE_ZKLOGIN_SALT_API_URL;

if (googleClientId && saltApiUrl) {
  initZkLogin({
    saltApiUrl,
    proverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL,
    providers: {
      google: {
        provider: "google",
        clientId: googleClientId,
        redirectUri: `${window.location.origin}/callback`,
      },
    },
  });
}

// Only query Nasun chains in portfolio (skip external chains like sui-testnet)
configurePortfolio({
  enabledChains: ['nasun-devnet'],
  includeTestnets: false,
});

// Configure Clear Signing with known contract registry
const contractRegistry = createContractRegistry();
configureClearSigning({ contractRegistry });
setFormatterConfig({ contractRegistry });

// Nasun brand theme for RainbowKit (dark mode, brand accent)
const nasunTheme = darkTheme({
  accentColor: "#448BBB",
  accentColorForeground: "#faf7f4",
  borderRadius: "medium",
});

export default function WalletLayer({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={nasunTheme}>
        <WalletProvider addressBookApiEndpoint={import.meta.env.VITE_WALLET_API_ENDPOINT}>
          <NasunProvider>{children}</NasunProvider>
        </WalletProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
