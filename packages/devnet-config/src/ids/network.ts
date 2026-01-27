/**
 * Network Configuration
 */
import config from '../../devnet-ids.json';
import type { NetworkConfig } from '../types';

export const CHAIN_ID = config.network.chainId;
export const RPC_URL = config.network.rpcUrl;
export const FAUCET_URL = config.network.faucetUrl;
export const EXPLORER_URL = config.network.explorerUrl;

export const NETWORK: NetworkConfig = {
  chainId: CHAIN_ID,
  rpcUrl: RPC_URL,
  faucetUrl: FAUCET_URL,
  explorerUrl: EXPLORER_URL,
};

// Admin address for contract deployments
export const ADMIN_ADDRESS = config.admin;
