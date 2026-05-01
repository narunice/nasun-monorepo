// src/providers/NasunProvider.tsx
// Nasun devnet 전용 Provider - 투표 시스템용
// Pairs SuiClientProvider (read queries) with @mysten/dapp-kit's
// WalletProvider so the uju Dashboard can open external Sui wallets
// (Slush/Suiet/etc) for display-only "open wallet" buttons.
//
// The dapp-kit WalletProvider is imported under an alias because
// @nasun/wallet-ui (in WalletLayer) also exports a `WalletProvider` for the
// Nasun-native wallet — keeping them as separate identifiers prevents
// confusion at call sites. Both providers can coexist; their contexts are
// independent.
import { ReactNode } from "react";
import {
  SuiClientProvider,
  WalletProvider as SuiDappWalletProvider,
} from "@mysten/dapp-kit";
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
      {/* autoConnect=false: prototype policy is to never silently connect
          external chain wallets. The user must click "Open Wallet" to trigger
          the wallet-side popup. */}
      <SuiDappWalletProvider autoConnect={false}>
        {children}
      </SuiDappWalletProvider>
    </SuiClientProvider>
  );
}
