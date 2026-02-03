/**
 * SDK configuration with devnet preset.
 *
 * Addresses are inlined from @nasun/devnet-config (Devnet V6, Chain ID: 12bf3808).
 * Run `scripts/sync-devnet-ids.ts` after a devnet reset to update these values.
 */

import type { BaramConfig } from './types';

// Nasun Devnet V6 contract addresses (synced from devnet-ids.json)
const DEVNET_RPC_URL = 'https://rpc.devnet.nasun.io';

const DEVNET_BARAM = {
  packageId: '0xfbe120e1847ca3ce7968bc7d85504a202639666755d581cfe642df3e57b2bc2f',
  registryId: '0x52427e24315a444e9aa07ecb93df5a3392e1cb5d5bec8aba90c4c9eecaf77d3f',
  executorPackageId: '0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc',
  executorRegistryId: '0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c',
  processedRequestsId: '0xc68e22ca8cc7851695c2a5466cc148221f31a94e02f4a65b1676c33ab8855404',
  tierRegistryId: '0x21c2344fc2d86c173fb8f8826493e96a93edd7155f3142b4be81be7775cee23c',
  compliancePackageId: '0x2c0e9e907bb33392b980e06b2758cf5ca9d7cd8e50f8f29b6ace2adbc65228b9',
  complianceRegistryId: '0x345048f83dd3566da939164bd784abfd47c9c0a754341064737f5554546d4773',
  nusdcType: '0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017::nusdc::NUSDC',
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
    compliance: {
      packageId: DEVNET_BARAM.compliancePackageId,
      registryId: DEVNET_BARAM.complianceRegistryId,
    },
    tokens: {
      nusdcType: DEVNET_BARAM.nusdcType,
    },
  };
}
