/**
 * Ethereum NFT API Client
 *
 * This module provides functions to fetch Ethereum NFT data from:
 * - Alchemy API (Primary - Fast & accurate NFT metadata)
 * - Etherscan API (Fallback - When Alchemy fails)
 *
 * Features:
 * - Automatic fallback from Alchemy to Etherscan
 * - Network auto-detection (Mainnet/Sepolia)
 * - Error handling and retry logic
 * - Rate limit protection
 * - NFT data normalization
 *
 * @module services/ethereumApi
 * @since 2025-11-13
 */

import type {
  AlchemyNFT,
  AlchemyNFTsResponse,
  EtherscanNFT,
  EtherscanNFTsResponse,
  EthereumNFT,
  EthereumAPIError,
} from '../types/ethereum';

// ============================================================================
// Configuration
// ============================================================================

const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet';
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY;

const ALCHEMY_BASE_URL = IS_MAINNET
  ? import.meta.env.VITE_ALCHEMY_MAINNET_URL
  : import.meta.env.VITE_ALCHEMY_SEPOLIA_URL;

const ETHERSCAN_BASE_URL = IS_MAINNET
  ? import.meta.env.VITE_ETHERSCAN_MAINNET_URL
  : import.meta.env.VITE_ETHERSCAN_SEPOLIA_URL;

const ETHERSCAN_EXPLORER_URL = IS_MAINNET
  ? 'https://etherscan.io'
  : 'https://sepolia.etherscan.io';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep for a given duration (for rate limit protection)
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Log debug message (only in development)
 */
const logDebug = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.log('[EthereumAPI]', ...args);
  }
};

/**
 * Log error message
 */
const logError = (...args: unknown[]): void => {
  console.error('[EthereumAPI]', ...args);
};

// ============================================================================
// Alchemy API Functions (Primary)
// ============================================================================

/**
 * Get NFTs owned by a wallet address using Alchemy API
 *
 * @param walletAddress - Ethereum wallet address
 * @returns Promise<AlchemyNFT[]>
 * @throws {EthereumAPIError} When API call fails
 */
export const getAlchemyNFTs = async (
  walletAddress: string
): Promise<AlchemyNFT[]> => {
  if (!ALCHEMY_API_KEY || ALCHEMY_API_KEY === 'your_alchemy_api_key_here') {
    throw new Error('Alchemy API key not configured');
  }

  const url = `${ALCHEMY_BASE_URL}${ALCHEMY_API_KEY}/getNFTsForOwner?owner=${walletAddress}&withMetadata=true`;

  logDebug('Fetching NFTs from Alchemy:', { walletAddress, url });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError('Alchemy API error:', response.status, errorText);
      throw {
        code: 'ALCHEMY_API_ERROR',
        message: `Alchemy API returned ${response.status}: ${errorText}`,
        source: 'alchemy',
        statusCode: response.status,
      } as EthereumAPIError;
    }

    const data: AlchemyNFTsResponse = await response.json();

    logDebug('Alchemy NFTs received:', {
      count: data.ownedNfts?.length || 0,
      totalCount: data.totalCount,
    });

    return data.ownedNfts || [];
  } catch (error) {
    if ((error as EthereumAPIError).source === 'alchemy') {
      throw error;
    }

    logError('Alchemy API network error:', error);
    throw {
      code: 'ALCHEMY_NETWORK_ERROR',
      message: `Network error: ${(error as Error).message}`,
      source: 'alchemy',
    } as EthereumAPIError;
  }
};

// ============================================================================
// Etherscan API Functions (Fallback)
// ============================================================================

/**
 * Get NFTs owned by a wallet address using Etherscan API
 *
 * Note: Etherscan returns NFT transfer events, not direct ownership.
 * This function filters for received NFTs.
 *
 * @param walletAddress - Ethereum wallet address
 * @returns Promise<EtherscanNFT[]>
 * @throws {EthereumAPIError} When API call fails
 */
export const getEtherscanNFTs = async (
  walletAddress: string
): Promise<EtherscanNFT[]> => {
  if (!ETHERSCAN_API_KEY || ETHERSCAN_API_KEY === 'your_etherscan_api_key_here') {
    throw new Error('Etherscan API key not configured');
  }

  const url = `${ETHERSCAN_BASE_URL}?module=account&action=tokennfttx&address=${walletAddress}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;

  logDebug('Fetching NFTs from Etherscan:', { walletAddress });

  try {
    const response = await fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError('Etherscan API error:', response.status, errorText);
      throw {
        code: 'ETHERSCAN_API_ERROR',
        message: `Etherscan API returned ${response.status}: ${errorText}`,
        source: 'etherscan',
        statusCode: response.status,
      } as EthereumAPIError;
    }

    const data: EtherscanNFTsResponse = await response.json();

    if (data.status !== '1') {
      logError('Etherscan API returned error status:', data.message);
      throw {
        code: 'ETHERSCAN_API_ERROR',
        message: `Etherscan API error: ${data.message}`,
        source: 'etherscan',
      } as EthereumAPIError;
    }

    // Filter for received NFTs only (where 'to' is the wallet address)
    const receivedNFTs = data.result.filter(
      (nft) => nft.to.toLowerCase() === walletAddress.toLowerCase()
    );

    logDebug('Etherscan NFTs received:', {
      total: data.result.length,
      received: receivedNFTs.length,
    });

    return receivedNFTs;
  } catch (error) {
    if ((error as EthereumAPIError).source === 'etherscan') {
      throw error;
    }

    logError('Etherscan API network error:', error);
    throw {
      code: 'ETHERSCAN_NETWORK_ERROR',
      message: `Network error: ${(error as Error).message}`,
      source: 'etherscan',
    } as EthereumAPIError;
  }
};

// ============================================================================
// Data Normalization Functions
// ============================================================================

/**
 * Normalize Alchemy NFT data to unified EthereumNFT format
 */
const normalizeAlchemyNFT = (nft: AlchemyNFT): EthereumNFT => {
  const imageUrl =
    nft.media?.[0]?.gateway ||
    nft.metadata?.image ||
    nft.contract.openSeaMetadata?.imageUrl ||
    undefined;

  const thumbnailUrl = nft.media?.[0]?.thumbnail || imageUrl;

  return {
    contractAddress: nft.contract.address.toLowerCase(),
    tokenId: nft.tokenId,
    name: nft.title || nft.metadata?.name || `#${nft.tokenId}`,
    description: nft.description || nft.metadata?.description,
    imageUrl,
    thumbnailUrl,
    collectionName:
      nft.contract.name || nft.contract.openSeaMetadata?.collectionName,
    tokenType: nft.tokenType,
    tokenSymbol: nft.contract.symbol,
    balance: nft.balance,
    openSea: nft.contract.openSeaMetadata
      ? {
          floorPrice: nft.contract.openSeaMetadata.floorPrice,
          imageUrl: nft.contract.openSeaMetadata.imageUrl,
        }
      : undefined,
    externalUrl: nft.metadata?.external_url,
    attributes: nft.metadata?.attributes?.map((attr) => ({
      traitType: attr.trait_type,
      value: attr.value,
    })),
    source: 'alchemy',
    lastUpdated: nft.timeLastUpdated,
  };
};

/**
 * Normalize Etherscan NFT data to unified EthereumNFT format
 *
 * Note: Etherscan doesn't provide metadata, so some fields will be missing
 */
const normalizeEtherscanNFT = (nft: EtherscanNFT): EthereumNFT => {
  return {
    contractAddress: nft.contractAddress.toLowerCase(),
    tokenId: nft.tokenID,
    name: nft.tokenName || `#${nft.tokenID}`,
    collectionName: nft.tokenName,
    tokenSymbol: nft.tokenSymbol,
    tokenType: 'UNKNOWN', // Etherscan doesn't provide token type
    source: 'etherscan',
    lastUpdated: new Date(parseInt(nft.timeStamp) * 1000).toISOString(),
  };
};

/**
 * Remove duplicate NFTs (same contract + tokenId)
 */
const deduplicateNFTs = (nfts: EthereumNFT[]): EthereumNFT[] => {
  const seen = new Set<string>();
  const unique: EthereumNFT[] = [];

  for (const nft of nfts) {
    const key = `${nft.contractAddress}-${nft.tokenId}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(nft);
    }
  }

  return unique;
};

// ============================================================================
// Unified API Function (Alchemy → Etherscan Fallback)
// ============================================================================

/**
 * Get Ethereum NFTs owned by a wallet address
 *
 * This function tries Alchemy API first, and falls back to Etherscan if Alchemy fails.
 *
 * @param walletAddress - Ethereum wallet address (0x...)
 * @returns Promise<EthereumNFT[]> - Array of normalized NFT data
 * @throws {Error} When both APIs fail
 *
 * @example
 * ```typescript
 * const nfts = await getEthereumNFTs('0x1234...5678');
 * console.log(`Found ${nfts.length} NFTs`);
 * ```
 */
export const getEthereumNFTs = async (
  walletAddress: string
): Promise<EthereumNFT[]> => {
  if (!walletAddress || !walletAddress.startsWith('0x')) {
    throw new Error('Invalid wallet address');
  }

  // Normalize wallet address to lowercase
  const normalizedAddress = walletAddress.toLowerCase();

  logDebug('Getting Ethereum NFTs for:', normalizedAddress);

  // Try Alchemy first (Primary)
  try {
    const alchemyNFTs = await getAlchemyNFTs(normalizedAddress);
    const normalizedNFTs = alchemyNFTs.map(normalizeAlchemyNFT);

    logDebug('✅ Alchemy API succeeded:', {
      count: normalizedNFTs.length,
    });

    return normalizedNFTs;
  } catch (alchemyError) {
    logError('⚠️ Alchemy API failed, falling back to Etherscan:', alchemyError);

    // Wait a bit before fallback (rate limit protection)
    await sleep(1000);

    // Fallback to Etherscan
    try {
      const etherscanNFTs = await getEtherscanNFTs(normalizedAddress);
      const normalizedNFTs = etherscanNFTs.map(normalizeEtherscanNFT);
      const deduplicatedNFTs = deduplicateNFTs(normalizedNFTs);

      logDebug('✅ Etherscan API succeeded (fallback):', {
        count: deduplicatedNFTs.length,
      });

      return deduplicatedNFTs;
    } catch (etherscanError) {
      logError('❌ Both Alchemy and Etherscan APIs failed');
      logError('Alchemy error:', alchemyError);
      logError('Etherscan error:', etherscanError);

      throw new Error(
        'Failed to fetch NFTs from both Alchemy and Etherscan. Please check your API keys and try again.'
      );
    }
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get Etherscan URL for an NFT
 */
export const getEtherscanNFTUrl = (
  contractAddress: string,
  tokenId: string
): string => {
  return `${ETHERSCAN_EXPLORER_URL}/nft/${contractAddress}/${tokenId}`;
};

/**
 * Get OpenSea URL for an NFT (Mainnet only)
 */
export const getOpenSeaNFTUrl = (
  contractAddress: string,
  tokenId: string
): string | null => {
  if (!IS_MAINNET) {
    return null; // OpenSea doesn't support testnets
  }
  return `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`;
};

/**
 * Check if API keys are configured
 */
export const areAPIKeysConfigured = (): {
  alchemy: boolean;
  etherscan: boolean;
} => {
  return {
    alchemy:
      !!ALCHEMY_API_KEY && ALCHEMY_API_KEY !== 'your_alchemy_api_key_here',
    etherscan:
      !!ETHERSCAN_API_KEY && ETHERSCAN_API_KEY !== 'your_etherscan_api_key_here',
  };
};
