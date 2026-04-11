/**
 * NFT Query and Transfer Utilities
 * Uses Sui Object Display Standard for metadata
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from './client';
import type { NFTInfo, NFTDisplay } from '../types/nft';

// Per-page limit for getOwnedObjects calls
const PAGE_LIMIT = 50;
// Safety cap: max pages to fetch (50 * 10 = 500 objects)
const MAX_OBJECT_PAGES = 10;

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
 * Extract hasPublicTransfer from raw RPC content.
 * This field is a sibling of `fields`, not inside it, so parseContent() cannot reach it.
 * Defaults to true when unknown to avoid falsely blocking legitimate transfers.
 */
function extractHasPublicTransfer(content: unknown): boolean {
  if (!content || typeof content !== 'object') return true;
  const c = content as Record<string, unknown>;
  if (c.dataType === 'moveObject' && typeof c.hasPublicTransfer === 'boolean') {
    return c.hasPublicTransfer;
  }
  return true;
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
 * Get all NFTs owned by an address.
 * Fetches ALL owned objects (paginated) then filters to NFTs.
 * Excludes Coin objects (fungible tokens).
 */
export async function getOwnedNFTs(address: string): Promise<NFTInfo[]> {
  const client = getSuiClient();
  const objectOptions = { showType: true, showDisplay: true, showContent: true };

  try {
    // Fetch first page
    const firstPage = await client.getOwnedObjects({
      owner: address,
      options: objectOptions,
      limit: PAGE_LIMIT,
    });

    const allObjects = [...firstPage.data];

    // Fetch remaining pages
    let cursor = firstPage.hasNextPage ? (firstPage.nextCursor ?? undefined) : undefined;
    for (let page = 1; page < MAX_OBJECT_PAGES && cursor; page++) {
      const result = await client.getOwnedObjects({
        owner: address,
        options: objectOptions,
        limit: PAGE_LIMIT,
        cursor,
      });
      allObjects.push(...result.data);
      cursor = result.hasNextPage ? (result.nextCursor ?? undefined) : undefined;
    }

    // Filter out Coins and parse NFT data
    const nfts: NFTInfo[] = [];

    for (const obj of allObjects) {
      if (!obj.data) continue;

      const type = obj.data.type || '';

      // Skip Coin types
      if (isCoinType(type)) continue;

      // Try Display standard first
      let display = parseDisplayData(obj.data.display);

      // Fallback to content.fields if Display standard data is not available
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
        hasPublicTransfer: extractHasPublicTransfer(obj.data.content),
      });
    }

    return nfts;
  } catch (error) {
    console.error('Failed to get owned NFTs:', error);
    return [];
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
      hasPublicTransfer: extractHasPublicTransfer(response.data.content),
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

// Regex to detect Pinata dedicated gateway URLs and extract the IPFS path
const PINATA_GATEWAY_RE = /^https?:\/\/[^/]+\.mypinata\.cloud\/ipfs\/(.+)$/i;

/**
 * Resolve a media URL to a safe, displayable URL.
 * Converts ipfs:// to HTTPS gateway, rewrites dead Pinata gateway URLs,
 * validates data: URIs, and blocks dangerous schemes (javascript:, vbscript:, etc.)
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
    // Rewrite dead Pinata dedicated gateway URLs to public IPFS gateway
    const pinataMatch = url.match(PINATA_GATEWAY_RE);
    if (pinataMatch) {
      return `https://ipfs.io/ipfs/${pinataMatch[1]}`;
    }
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
