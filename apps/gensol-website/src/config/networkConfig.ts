import { getFullnodeUrl } from "@mysten/sui/client"
import { createNetworkConfig } from "@mysten/dapp-kit"
import {
  DEVNET_DASHBOARD_ID,
  DEVNET_KIOSK_ID,
  DEVNET_PACKAGE_ID,
  DEVNET_SUPPLY_LIMIT_ID,
  LOCALNET_DASHBOARD_ID,
  LOCALNET_KIOSK_ID,
  LOCALNET_PACKAGE_ID,
  LOCALNET_SUPPLY_LIMIT_ID,
  MAINNET_DASHBOARD_ID,
  MAINNET_KIOSK_ID,
  MAINNET_PACKAGE_ID,
  MAINNET_SUPPLY_LIMIT_ID,
  TESTNET_DASHBOARD_ID,
  TESTNET_KIOSK_ID,
  TESTNET_PACKAGE_ID,
  TESTNET_SUPPLY_LIMIT_ID,
} from "../constants/packageConstants"

const { networkConfig, useNetworkVariable } = createNetworkConfig({
  localnet: {
    url: getFullnodeUrl("localnet"),
    variables: {
      packageId: LOCALNET_PACKAGE_ID,
      dashboardId: LOCALNET_DASHBOARD_ID,
      supplyLimitId: LOCALNET_SUPPLY_LIMIT_ID,
      kioskId: LOCALNET_KIOSK_ID,
    },
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
    variables: {
      packageId: DEVNET_PACKAGE_ID,
      dashboardId: DEVNET_DASHBOARD_ID,
      supplyLimitId: DEVNET_SUPPLY_LIMIT_ID,
      kioskId: DEVNET_KIOSK_ID,
    },
  },
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      packageId: TESTNET_PACKAGE_ID,
      dashboardId: TESTNET_DASHBOARD_ID,
      supplyLimitId: TESTNET_SUPPLY_LIMIT_ID,
      kioskId: TESTNET_KIOSK_ID,
    },
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
    variables: {
      packageId: MAINNET_PACKAGE_ID,
      dashboardId: MAINNET_DASHBOARD_ID,
      supplyLimitId: MAINNET_SUPPLY_LIMIT_ID,
      kioskId: MAINNET_KIOSK_ID,
    },
  },
})

export { networkConfig, useNetworkVariable }
