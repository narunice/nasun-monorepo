/**
 * SDK configuration with devnet preset.
 *
 * Addresses are inlined from @nasun/devnet-config (Devnet V7, Chain ID: 272218f1).
 * Run `scripts/sync-devnet-ids.ts` after a devnet reset to update these values.
 */

import type { BaramConfig } from './types';

// Nasun Devnet V7 contract addresses (synced from devnet-ids.json)
const DEVNET_RPC_URL = 'https://rpc.devnet.nasun.io';

const DEVNET_BARAM = {
  packageId: '0xb0dc22daa1a002eeea5e33a7862ba3ab9f0b0625e7fcc269a21aa714180c9aa7',
  registryId: '0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833',
  executorPackageId: '0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd',
  executorRegistryId: '0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656',
  processedRequestsId: '0x1d88bb96c90d9bde3a2c10fa4e26f3180e948dae908cb09ef4d6a79e905d7e48',
  tierRegistryId: '0xda37bee40cdc5e9a6188ddf021fe78d3328ff6384e84dc36014479c07e4300f1',
  aerPackageId: '0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0',
  aerRegistryId: '0xf1acc0794f5aa692de3f825953b708f940c5ccd83655bf79fe0c520052588583',
  // Budget module is now part of baram package (same packageId)
  budgetPackageId: '0xb0dc22daa1a002eeea5e33a7862ba3ab9f0b0625e7fcc269a21aa714180c9aa7',
  nusdcType: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC',
} as const;

/**
 * Create a BaramConfig preset for Nasun Devnet.
 */
export function createDevnetConfig(): BaramConfig {
  return {
    rpcUrl: DEVNET_RPC_URL,
    baram: {
      packageId: DEVNET_BARAM.packageId,
      registryId: DEVNET_BARAM.registryId,
    },
    executor: {
      packageId: DEVNET_BARAM.executorPackageId,
      registryId: DEVNET_BARAM.executorRegistryId,
      processedRequestsId: DEVNET_BARAM.processedRequestsId,
      tierRegistryId: DEVNET_BARAM.tierRegistryId,
    },
    aer: {
      packageId: DEVNET_BARAM.aerPackageId,
      registryId: DEVNET_BARAM.aerRegistryId,
    },
    // Budget is optional - only included if deployed
    ...(DEVNET_BARAM.budgetPackageId && {
      budget: {
        packageId: DEVNET_BARAM.budgetPackageId,
      },
    }),
    tokens: {
      nusdcType: DEVNET_BARAM.nusdcType,
    },
  };
}
