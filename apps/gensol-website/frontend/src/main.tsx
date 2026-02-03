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
import { configureWallet, initZkLogin } from "@nasun/wallet"
import { WalletProvider as NasunWalletProvider } from "@nasun/wallet-ui"
import "@radix-ui/themes/styles.css"
import "@mysten/dapp-kit/dist/index.css"
import "./index.css"
import { ToastContainer } from "react-toastify"

// Legacy Amplify config format — type mismatch with v6 ResourcesConfig is expected
Amplify.configure(awsConfig as Parameters<typeof Amplify.configure>[0])

// Configure Nasun Wallet
configureWallet({
  rpcUrl: import.meta.env.VITE_NASUN_RPC_URL || "https://rpc.devnet.nasun.io",
  faucetUrl: import.meta.env.VITE_NASUN_FAUCET_URL || "https://faucet.devnet.nasun.io",
  networkName: "Nasun Devnet",
  sessionPersist: true, // Keep wallet unlocked during browser session
})

// Initialize zkLogin (Google OAuth)
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const saltApiUrl = import.meta.env.VITE_ZKLOGIN_SALT_API_URL

if (googleClientId && saltApiUrl) {
  initZkLogin({
    saltApiUrl,
    proverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL,
    providers: {
      google: {
        provider: "google",
        clientId: googleClientId,
        redirectUri: `${window.location.origin}/auth/callback`,
      },
    },
  })
}

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

  if (!networks.includes(network)) {
    return "testnet"
  }
  return network
}
