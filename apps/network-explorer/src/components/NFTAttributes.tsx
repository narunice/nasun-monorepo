/**
 * NFTAttributes Component
 * Displays NFT attributes as visual badges
 */

import type { NFTAttribute } from '../lib/nft';

interface NFTAttributesProps {
  attributes: NFTAttribute[];
}

export default function NFTAttributes({ attributes }: NFTAttributesProps) {
  if (attributes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No attributes available</p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {attributes.map((attr, index) => (
        <div
          key={`${attr.trait_type}-${index}`}
          className="bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors"
        >
          <div className="text-xs text-primary uppercase tracking-wide truncate">
            {attr.trait_type}
          </div>
          <div className="text-sm text-foreground font-medium mt-1 truncate" title={attr.value}>
            {attr.value}
          </div>
        </div>
      ))}
    </div>
  );
}
