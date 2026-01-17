/**
 * Multi-chain Configuration
 *
 * Supports both Move-based chains (Nasun/Sui) and EVM chains.
 */

/** Chain type identifier */
export type ChainType = 'move' | 'evm';

/** Native currency configuration */
export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

/** Account Abstraction configuration (EVM only) */
export interface AAConfig {
  /** Bundler RPC URL */
  bundlerUrl: string;
  /** Paymaster URL (optional) */
  paymasterUrl?: string;
  /** EntryPoint contract address */
  entryPoint: `0x${string}`;
}

/** Chain configuration */
export interface ChainConfig {
  /** Unique chain identifier */
  id: string;
  /** Display name */
  name: string;
  /** Chain type (move or evm) */
  type: ChainType;
  /** RPC endpoint */
  rpcUrl: string;
  /** Native currency */
  nativeCurrency: NativeCurrency;
  /** Block explorer URL */
  blockExplorer?: string;
  /** EVM chain ID (only for EVM chains) */
  chainId?: number;
  /** Account Abstraction config (only for EVM chains with AA support) */
  aa?: AAConfig;
  /** Whether this is a testnet */
  testnet?: boolean;
  /** Chain icon URL */
  iconUrl?: string;
}

/**
 * Supported chains registry
 *
 * Move chains: Nasun Devnet
 * EVM chains: Ethereum, Base, Arbitrum
 */
export const CHAINS: Record<string, ChainConfig> = {
  // Move-based chains
  'nasun-devnet': {
    id: 'nasun-devnet',
    name: 'Nasun Devnet',
    type: 'move',
    rpcUrl: 'https://rpc.devnet.nasun.io',
    nativeCurrency: {
      name: 'Nasun',
      symbol: 'NSN',
      decimals: 9,
    },
    blockExplorer: 'https://explorer.devnet.nasun.io',
    testnet: true,
  },

  // EVM chains
  'ethereum': {
    id: 'ethereum',
    name: 'Ethereum',
    type: 'evm',
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://etherscan.io',
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/1/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  'base': {
    id: 'base',
    name: 'Base',
    type: 'evm',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://basescan.org',
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/8453/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  'arbitrum': {
    id: 'arbitrum',
    name: 'Arbitrum One',
    type: 'evm',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://arbiscan.io',
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/42161/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  // Testnets
  'sepolia': {
    id: 'base-sepolia',
    name: 'Base Sepolia',
    type: 'evm',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://sepolia.basescan.org',
    testnet: true,
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/84532/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  'arbitrum-sepolia': {
    id: 'arbitrum-sepolia',
    name: 'Arbitrum Sepolia',
    type: 'evm',
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://sepolia.arbiscan.io',
    testnet: true,
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/421614/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  'optimism-sepolia': {
    id: 'optimism-sepolia',
    name: 'Optimism Sepolia',
    type: 'evm',
    chainId: 11155420,
    rpcUrl: 'https://sepolia.optimism.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://sepolia-optimism.etherscan.io',
    testnet: true,
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/11155420/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  'polygon-amoy': {
    id: 'polygon-amoy',
    name: 'Polygon Amoy',
    type: 'evm',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    blockExplorer: 'https://amoy.polygonscan.com',
    testnet: true,
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/80002/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },

  'linea-sepolia': {
    id: 'linea-sepolia',
    name: 'Linea Sepolia',
    type: 'evm',
    chainId: 59141,
    rpcUrl: 'https://rpc.sepolia.linea.build',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://sepolia.lineascan.build',
    testnet: true,
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/59141/rpc',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },
};

/** Default chain ID */
export const DEFAULT_CHAIN_ID = 'nasun-devnet';

/**
 * Get chain configuration by ID
 */
export function getChain(id: string): ChainConfig | undefined {
  return CHAINS[id];
}

/**
 * Get all supported chains
 */
export function getAllChains(): ChainConfig[] {
  return Object.values(CHAINS);
}

/**
 * Get all Move-based chains
 */
export function getMoveChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.type === 'move');
}

/**
 * Get all EVM chains
 */
export function getEVMChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.type === 'evm');
}

/**
 * Get all mainnet chains
 */
export function getMainnetChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => !c.testnet);
}

/**
 * Get all testnet chains
 */
export function getTestnetChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.testnet);
}

/**
 * Get chain by EVM chain ID
 */
export function getChainByEvmId(chainId: number): ChainConfig | undefined {
  return Object.values(CHAINS).find((c) => c.chainId === chainId);
}

/**
 * Check if a chain supports Account Abstraction
 */
export function supportsAA(chainId: string): boolean {
  const chain = getChain(chainId);
  return !!chain?.aa;
}
