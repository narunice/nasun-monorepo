/**
 * SDK configuration with devnet preset
 */

import { BARAM, NETWORK } from '@nasun/devnet-config';
import type { BaramConfig } from './types';

/**
 * Create a BaramConfig for Nasun Devnet using addresses from @nasun/devnet-config.
 */
export function createDevnetConfig(): BaramConfig {
  return {
    rpcUrl: NETWORK.rpcUrl,
    baram: {
      packageId: BARAM.packageId,
      registryId: BARAM.registry,
    },
    executor: {
      packageId: BARAM.executorPackageId,
      registryId: BARAM.executorRegistry,
      processedRequestsId: BARAM.processedRequests,
      tierRegistryId: BARAM.tierRegistry,
    },
    compliance: {
      packageId: BARAM.compliancePackageId,
      registryId: BARAM.complianceRegistry,
    },
    tokens: {
      nusdcType: BARAM.nusdcType,
    },
  };
}
