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
      <p className="text-nasun-white/50 text-sm">No attributes available</p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {attributes.map((attr, index) => (
        <div
          key={`${attr.trait_type}-${index}`}
          className="bg-nasun-c6/60 border border-nasun-c5/30 rounded-lg p-3 hover:border-nasun-c4/50 transition-colors"
        >
          <div className="text-xs text-nasun-c4 uppercase tracking-wide truncate">
            {attr.trait_type}
          </div>
          <div className="text-sm text-nasun-white font-medium mt-1 truncate" title={attr.value}>
            {attr.value}
          </div>
        </div>
      ))}
    </div>
  );
}
