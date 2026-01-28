// src/providers/NasunProvider.tsx
// Nasun devnet 전용 Provider - 투표 시스템용
// Only SuiClientProvider is needed for useSuiClientQuery etc.
// WalletProvider from @mysten/dapp-kit removed to prevent conflicts with @nasun/wallet-ui
import { ReactNode } from "react";
import { SuiClientProvider } from "@mysten/dapp-kit";
import { networkConfig } from "../config/suiNetworkConfig";

export function NasunProvider({ children }: { children: ReactNode }) {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork="nasundevnet">
      {children}
    </SuiClientProvider>
  );
}
