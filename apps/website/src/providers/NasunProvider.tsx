// src/providers/NasunProvider.tsx
// Nasun devnet 전용 Provider - 투표 시스템용
import { ReactNode } from "react";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { networkConfig } from "../config/suiNetworkConfig";
import "@mysten/dapp-kit/dist/index.css";

export function NasunProvider({ children }: { children: ReactNode }) {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork="nasundevnet">
      <WalletProvider autoConnect>
        {children}
      </WalletProvider>
    </SuiClientProvider>
  );
}
