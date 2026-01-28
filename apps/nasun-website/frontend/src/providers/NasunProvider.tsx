// src/providers/NasunProvider.tsx
// Nasun devnet 전용 Provider - 투표 시스템용
// Only SuiClientProvider is needed for useSuiClientQuery etc.
// WalletProvider from @mysten/dapp-kit removed to prevent conflicts with @nasun/wallet-ui
import { ReactNode } from "react";
import { SuiClientProvider } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import { networkConfig } from "../config/suiNetworkConfig";

export function NasunProvider({ children }: { children: ReactNode }) {
  // Share the same QueryClient with SuiClientProvider to prevent query isolation issues
  const queryClient = useQueryClient();

  return (
    <SuiClientProvider
      networks={networkConfig}
      defaultNetwork="nasundevnet"
      queryClient={queryClient}
    >
      {children}
    </SuiClientProvider>
  );
}
