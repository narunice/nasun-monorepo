// frontend/src/main.tsx
import { createRoot } from "react-dom/client"
import { StrictMode } from "react"
import App from "./App.tsx"
import { networkConfig } from "./config/networkConfig.ts"
import { Theme } from "@radix-ui/themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit"
import { Amplify } from "aws-amplify"
import awsConfig from "./config/awsConfig"
import { AuthProvider } from "./providers/auth"
import { configureWallet } from "@nasun/wallet"
import { WalletProvider as NasunWalletProvider } from "@nasun/wallet-ui"
import "@radix-ui/themes/styles.css"
import "@mysten/dapp-kit/dist/index.css"
import "./index.css"
import { ToastContainer } from "react-toastify"

Amplify.configure(awsConfig as any)

// Configure Nasun Wallet
configureWallet({
  rpcUrl: import.meta.env.VITE_NASUN_RPC_URL || "https://rpc.devnet.nasun.io",
  faucetUrl: import.meta.env.VITE_NASUN_FAUCET_URL || "https://faucet.devnet.nasun.io",
  networkName: "Nasun Devnet",
})

const queryClient = new QueryClient()

const container = document.getElementById("root")
if (!container) throw new Error("Failed to find the root element")

const root = createRoot(container)

root.render(
  <StrictMode>
    <Theme appearance="dark">
      <QueryClientProvider client={queryClient}>
        <NasunWalletProvider>
          <SuiClientProvider networks={networkConfig} defaultNetwork={getNetwork()}>
            <WalletProvider autoConnect={true}>
              <AuthProvider>
                <App />
                <ToastContainer position="top-right" autoClose={4000} theme="light" />
              </AuthProvider>
            </WalletProvider>
          </SuiClientProvider>
        </NasunWalletProvider>
      </QueryClientProvider>
    </Theme>
  </StrictMode>
)

function getNetwork() {
  const networks = ["mainnet", "devnet", "testnet", "localnet"]
  const network = import.meta.env.VITE_NETWORK

  console.log("Selecting: " + network)

  if (!networks.includes(network)) {
    return "testnet"
  }
  return network
}
