/**
 * AER SDK configuration
 */

export interface AERConfig {
  rpcUrl: string;
  aer: {
    packageId: string;
    registryId: string;
  };
}

/**
 * Create AERConfig preset for Nasun Devnet V7.
 * AER Package deployed 2026-02-08.
 */
export function createDevnetConfig(): AERConfig {
  return {
    rpcUrl: 'https://rpc.devnet.nasun.io',
    aer: {
      packageId:
        '0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0',
      registryId:
        '0xf1acc0794f5aa692de3f825953b708f940c5ccd83655bf79fe0c520052588583',
    },
  };
}
