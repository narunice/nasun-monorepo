// src/config/suiNetworkConfig.ts
// Nasun devnet 전용 네트워크 설정
import { createNetworkConfig } from "@mysten/dapp-kit";
import {
  NASUN_DEVNET_PACKAGE_ID,
  NASUN_DEVNET_DASHBOARD_ID,
  NASUN_DEVNET_DELEGATION_REGISTRY_ID,
} from "../constants/suiPackageConstants";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  nasundevnet: {
    url: "https://rpc.devnet.nasun.io",
    variables: {
      packageId: NASUN_DEVNET_PACKAGE_ID,
      dashboardId: NASUN_DEVNET_DASHBOARD_ID,
      delegationRegistryId: NASUN_DEVNET_DELEGATION_REGISTRY_ID,
    },
  },
});

export { networkConfig, useNetworkVariable, useNetworkVariables };
