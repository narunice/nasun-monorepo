// frontend/src/main.tsx
import { createRoot } from "react-dom/client"
import { StrictMode } from "react"
import App from "./App.tsx"
import { networkConfig } from "./config/networkConfig.ts"
import { Theme } from "@radix-ui/themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit"
import "@radix-ui/themes/styles.css"
import "@mysten/dapp-kit/dist/index.css"
import "./index.css"
import { ToastContainer } from "react-toastify"

const queryClient = new QueryClient()

const container = document.getElementById("root")
if (!container) throw new Error("Failed to find the root element")

const root = createRoot(container)

root.render(
  <StrictMode>
    <Theme appearance="dark">
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider networks={networkConfig} defaultNetwork={getNetwork()}>
          <WalletProvider autoConnect={true}>
            <App />
            <ToastContainer position="top-right" autoClose={4000} theme="light" />
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </Theme>
  </StrictMode>
)

function getNetwork() {
  const networks = ["mainnet", "devnet", "testnet", "localnet"]
  const network = import.meta.env.VITE_NETWORK

  if (!networks.includes(network)) {
    return "testnet"
  }
  return network
}
