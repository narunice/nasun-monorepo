/**
 * Shared object parsing utilities for Sui objects
 * Consolidates duplicated logic from Object.tsx, NFTDetailView.tsx, and sui-client.ts
 */

// Parse moveObject content to extract fields
export function parseContent(
  content: unknown
): { fields?: Record<string, unknown> } | null {
  if (!content || typeof content !== 'object') return null;
  const c = content as { dataType?: string; fields?: unknown };
  if (c.dataType !== 'moveObject') return null;
  return { fields: c.fields as Record<string, unknown> };
}

// Check if type is a Coin type
export function isCoinType(type: string | null | undefined): boolean {
  if (!type) return false;
  return type.startsWith('0x2::coin::Coin<');
}

// Extract package ID from type (e.g., "0x2::coin::Coin" -> "0x2")
export function extractPackageId(type: string | null | undefined): string | null {
  if (!type) return null;
  const match = type.match(/^(0x[a-fA-F0-9]+)::/);
  return match ? match[1] : null;
}

// Get owner address from Sui owner object
export function getOwnerAddress(owner: unknown): string | null {
  if (!owner || typeof owner !== 'object') return null;
  if ('AddressOwner' in (owner as Record<string, unknown>)) {
    return (owner as { AddressOwner: string }).AddressOwner;
  }
  if ('ObjectOwner' in (owner as Record<string, unknown>)) {
    return (owner as { ObjectOwner: string }).ObjectOwner;
  }
  return null;
}

// Get displayable owner string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOwnerDisplay(owner: any): string {
  if (!owner) return '-';
  if (owner === 'Immutable') return 'Immutable';
  if (typeof owner === 'object') {
    if ('AddressOwner' in owner) return owner.AddressOwner;
    if ('ObjectOwner' in owner) return owner.ObjectOwner;
    if ('Shared' in owner) return `Shared (v${owner.Shared.initial_shared_version})`;
  }
  return '-';
}

// Get explorer link path for owner
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOwnerLink(owner: any): string | undefined {
  if (!owner || typeof owner !== 'object') return undefined;
  if ('AddressOwner' in owner) return `/address/${owner.AddressOwner}`;
  if ('ObjectOwner' in owner) return `/object/${owner.ObjectOwner}`;
  return undefined;
}
