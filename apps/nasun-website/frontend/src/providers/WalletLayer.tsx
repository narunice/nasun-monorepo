// Lazy-loaded wallet layer — keeps @nasun/wallet, @nasun/wallet-ui, and @mysten/dapp-kit
// out of the initial bundle. Downloaded on-demand after the app shell renders.

import type { ReactNode } from "react";
import { configureWallet, initZkLogin } from "@nasun/wallet";
import { WalletProvider } from "@nasun/wallet-ui";
import { NasunProvider } from "./NasunProvider";

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

export default function WalletLayer({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <NasunProvider>{children}</NasunProvider>
    </WalletProvider>
  );
}
