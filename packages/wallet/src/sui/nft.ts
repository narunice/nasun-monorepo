/**
 * NFT Query and Transfer Utilities
 * Uses Sui Object Display Standard for metadata
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from './client';
import type { NFTInfo, NFTQueryOptions, NFTQueryResult, NFTDisplay } from '../types/nft';

// Default query limit
const DEFAULT_LIMIT = 50;

/**
 * Parse Display data from Sui response
 * Handles both successful responses and error responses (when Display<T> is not registered)
 */
function parseDisplayData(displayData: unknown): NFTDisplay {
  if (!displayData || typeof displayData !== 'object') {
    return {};
  }

  const data = displayData as Record<string, unknown>;

  // Check if this is an error response (Display<T> not registered)
  // Error format: { error: { code: "displayError", ... } }
  if (data.error) {
    return {};
  }

  // Handle the nested structure: { data: { name: ..., image_url: ... } }
  const fields = (data.data as Record<string, string | undefined>) || data;

  // Ensure we don't pick up random properties from non-Display objects
  if (!fields || typeof fields !== 'object') {
    return {};
  }

  return {
    name: fields.name,
    description: fields.description,
    image_url: fields.image_url,
    thumbnail_url: fields.thumbnail_url,
    link: fields.link,
    project_url: fields.project_url,
    creator: fields.creator,
  };
}

/**
 * Parse content fields from object
 */
function parseContent(content: unknown): Record<string, unknown> | undefined {
  if (!content || typeof content !== 'object') {
    return undefined;
  }

  const c = content as Record<string, unknown>;
  if (c.dataType === 'moveObject' && c.fields) {
    return c.fields as Record<string, unknown>;
  }

  return undefined;
}

/**
 * Build display data from content fields (fallback for NFTs without Display<T> registered)
 * Many NFTs store name, url, description directly in object fields
 */
export function buildDisplayFromContent(content: Record<string, unknown> | undefined): NFTDisplay {
  if (!content) return {};

  return {
    name: content.name as string | undefined,
    description: content.description as string | undefined,
    // Common patterns: url, image_url, image, img_url
    image_url: (content.image_url || content.url || content.image || content.img_url) as string | undefined,
    thumbnail_url: content.thumbnail_url as string | undefined,
    link: content.link as string | undefined,
    project_url: content.project_url as string | undefined,
    creator: content.creator as string | undefined,
  };
}

/**
 * Check if an object type is a Coin (to filter out)
 */
function isCoinType(type: string): boolean {
  return type.includes('::coin::Coin<');
}

/**
 * Get all NFTs owned by an address
 * Excludes Coin objects (fungible tokens)
 */
export async function getOwnedNFTs(
  address: string,
  options: NFTQueryOptions = {}
): Promise<NFTQueryResult> {
  const client = getSuiClient();
  const limit = options.limit || DEFAULT_LIMIT;

  try {
    const response = await client.getOwnedObjects({
      owner: address,
      options: {
        showType: true,
        showDisplay: true,
        showContent: true,
      },
      cursor: options.cursor,
      limit,
    });

    // Filter out Coins and parse NFT data
    const nfts: NFTInfo[] = [];

    for (const obj of response.data) {
      if (!obj.data) continue;

      const type = obj.data.type || '';

      // Skip Coin types
      if (isCoinType(type)) continue;

      // Try Display standard first
      let display = parseDisplayData(obj.data.display);

      // Fallback to content.fields if Display standard data is not available
      // (for NFTs that don't have Display<T> registered)
      const content = parseContent(obj.data.content);
      if (!display.name && !display.image_url) {
        display = buildDisplayFromContent(content);
      }

      // Skip objects without any displayable metadata
      if (!display.name && !display.image_url) continue;

      nfts.push({
        objectId: obj.data.objectId,
        version: obj.data.version,
        digest: obj.data.digest,
        type,
        display,
        content: parseContent(obj.data.content),
      });
    }

    return {
      data: nfts,
      hasNextPage: response.hasNextPage,
      nextCursor: response.nextCursor || undefined,
    };
  } catch (error) {
    console.error('Failed to get owned NFTs:', error);
    return {
      data: [],
      hasNextPage: false,
    };
  }
}

/**
 * Get a single NFT by object ID
 */
export async function getNFT(objectId: string): Promise<NFTInfo | null> {
  const client = getSuiClient();

  try {
    const response = await client.getObject({
      id: objectId,
      options: {
        showType: true,
        showDisplay: true,
        showContent: true,
      },
    });

    if (!response.data) return null;

    const type = response.data.type || '';
    const content = parseContent(response.data.content);

    // Try Display standard first, fallback to content.fields
    let display = parseDisplayData(response.data.display);
    if (!display.name && !display.image_url) {
      display = buildDisplayFromContent(content);
    }

    return {
      objectId: response.data.objectId,
      version: response.data.version,
      digest: response.data.digest,
      type,
      display,
      content,
    };
  } catch (error) {
    console.error('Failed to get NFT:', error);
    return null;
  }
}

/**
 * Build a transaction to transfer an NFT
 * Returns the transaction block to be signed
 */
export function buildNFTTransferTransaction(
  objectId: string,
  recipientAddress: string
): Transaction {
  const tx = new Transaction();

  // Transfer the object to the recipient
  tx.transferObjects([tx.object(objectId)], recipientAddress);

  return tx;
}

/**
 * Get collection name from type string
 * e.g., "0x123::my_collection::NFT" -> "my_collection"
 */
export function getCollectionFromType(type: string): string {
  const parts = type.split('::');
  if (parts.length >= 2) {
    return parts[1];
  }
  return 'Unknown Collection';
}

// Safe data: URI MIME type prefixes (SVG excluded — can contain embedded scripts)
const SAFE_DATA_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/gif',
  'data:image/webp',
  'data:image/avif',
];

/**
 * Resolve a media URL to a safe, displayable URL.
 * Converts ipfs:// to HTTPS gateway, validates data: URIs,
 * and blocks dangerous schemes (javascript:, vbscript:, etc.)
 */
export function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  const lower = url.toLowerCase().trim();

  if (lower.startsWith('data:')) {
    if (SAFE_DATA_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      return url;
    }
    return undefined;
  }

  if (lower.startsWith('ipfs://')) {
    const hash = url.slice(7);
    return `https://ipfs.io/ipfs/${hash}`;
  }

  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    return url;
  }

  return undefined;
}

/**
 * Get the image URL to display
 * Prefers thumbnail_url for performance, falls back to image_url.
 * Resolves IPFS URLs and validates URL schemes for security.
 */
export function getNFTImageUrl(display: NFTDisplay): string | undefined {
  const raw = display.thumbnail_url || display.image_url;
  return resolveMediaUrl(raw);
}
