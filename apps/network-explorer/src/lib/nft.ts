/**
 * NFT utility functions for Network Explorer
 * Provides attribute extraction, collection parsing, and NFT metadata helpers
 */

export interface NFTAttribute {
  trait_type: string;
  value: string;
}

/**
 * Parse content.fields to extract the actual fields object
 * Handles nested structure from Sui RPC response
 */
function parseContentFields(
  content: { fields?: Record<string, unknown> } | null | undefined
): Record<string, unknown> | undefined {
  if (!content?.fields) return undefined;

  // Handle nested id structure (common in Sui objects)
  const fields = { ...content.fields };

  // Remove the 'id' field if it's an object (UID)
  if (typeof fields.id === 'object') {
    delete fields.id;
  }

  return fields;
}

/**
 * Extract NFT attributes from Display and content.fields
 * Handles both Display standard attributes field and direct content.fields
 */
export function extractAttributes(
  display: Record<string, string | undefined> | null | undefined,
  content: { fields?: Record<string, unknown> } | null | undefined
): NFTAttribute[] {
  // 1. Try Display attributes field (JSON string format)
  if (display?.attributes) {
    try {
      const parsed = JSON.parse(display.attributes);
      if (Array.isArray(parsed)) {
        return parsed.map((attr) => ({
          trait_type: String(attr.trait_type || attr.name || ''),
          value: String(attr.value || ''),
        }));
      }
    } catch {
      // Invalid JSON, fall through to content.fields
    }
  }

  // 2. Extract from content.fields (excluding meta fields)
  const fields = parseContentFields(content);
  if (!fields) return [];

  const metaFields = new Set([
    'id',
    'name',
    'description',
    'url',
    'image_url',
    'image',
    'animation_url',
    'thumbnail_url',
    'link',
    'project_url',
    'creator',
  ]);

  return Object.entries(fields)
    .filter(([key, value]) => {
      // Exclude meta fields
      if (metaFields.has(key)) return false;
      // Exclude complex objects
      if (typeof value === 'object' && value !== null) return false;
      // Exclude empty values
      if (value === '' || value === null || value === undefined) return false;
      return true;
    })
    .map(([key, value]) => ({
      trait_type: formatTraitType(key),
      value: formatTraitValue(value),
    }));
}

/**
 * Format trait type for display (snake_case -> Title Case)
 */
function formatTraitType(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format trait value for display
 */
function formatTraitValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
}

/**
 * Extract collection name from NFT type
 * e.g., "0x1234...::suipunks::SuiPunk" -> "SuiPunk"
 */
export function getCollectionName(type: string | null | undefined): string | undefined {
  if (!type) return undefined;

  // Extract the struct name (last part after ::)
  const parts = type.split('::');
  if (parts.length < 3) return undefined;

  return parts[parts.length - 1];
}

/**
 * Extract module name from NFT type
 * e.g., "0x1234...::suipunks::SuiPunk" -> "suipunks"
 */
export function getModuleName(type: string | null | undefined): string | undefined {
  if (!type) return undefined;

  const parts = type.split('::');
  if (parts.length < 3) return undefined;

  return parts[parts.length - 2];
}

/**
 * Extract package ID from NFT type
 * e.g., "0x1234...::suipunks::SuiPunk" -> "0x1234..."
 */
export function getPackageId(type: string | null | undefined): string | undefined {
  if (!type) return undefined;

  const parts = type.split('::');
  if (parts.length < 1) return undefined;

  return parts[0];
}

/**
 * Shorten address/ID for display
 */
export function shortenId(id: string, chars: number = 6): string {
  if (id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars + 2)}...${id.slice(-chars)}`;
}
