/**
 * NFT Card Component
 * Displays a single NFT with image and name
 */

import { useState } from 'react';
import type { NFTInfo } from '@nasun/wallet';
import { getNFTImageUrl, getCollectionFromType } from '@nasun/wallet';

interface NFTCardProps {
  /** NFT data */
  nft: NFTInfo;
  /** Click handler */
  onClick?: (nft: NFTInfo) => void;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

export function NFTCard({ nft, onClick, compact = false }: NFTCardProps) {
  const [imageError, setImageError] = useState(false);

  const imageUrl = getNFTImageUrl(nft.display);
  const name = nft.display.name || 'Unnamed NFT';
  const collection = getCollectionFromType(nft.type);

  const handleClick = () => {
    onClick?.(nft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(nft);
    }
  };

  // Placeholder for missing/broken images
  const renderPlaceholder = () => (
    <div className="w-full h-full bg-gray-100 dark:bg-zinc-700 flex items-center justify-center">
      <svg
        className={`text-gray-400 dark:text-zinc-400 ${compact ? 'w-6 h-6' : 'w-10 h-10'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="bg-white dark:bg-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
      >
        {/* Image */}
        <div className="aspect-square">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            renderPlaceholder()
          )}
        </div>

        {/* Name */}
        <div className="p-2">
          <p className="text-xs xl:text-sm text-gray-900 dark:text-white truncate" title={name}>
            {name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="bg-white dark:bg-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group"
    >
      {/* Image */}
      <div className="aspect-square relative">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          renderPlaceholder()
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm md:text-base font-medium text-gray-900 dark:text-white truncate" title={name}>
          {name}
        </p>
        <p className="text-xs md:text-sm xl:text-base text-gray-500 dark:text-zinc-400 truncate mt-0.5" title={collection}>
          {collection}
        </p>
      </div>
    </div>
  );
}
