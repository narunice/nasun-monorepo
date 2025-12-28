/**
 * NFT Detail Component
 * Modal displaying full NFT information with transfer option
 */

import { useState, useEffect } from 'react';
import {
  type NFTInfo,
  getNFTImageUrl,
  getCollectionFromType,
  getExplorerObjectUrl,
} from '@nasun/wallet';
import { NFTTransfer } from './NFTTransfer';
import { CopyableAddress } from './CopyableAddress';

interface NFTDetailProps {
  /** NFT data */
  nft: NFTInfo;
  /** Close handler */
  onClose: () => void;
  /** Transfer success callback */
  onTransferSuccess?: (digest: string) => void;
}

export function NFTDetail({ nft, onClose, onTransferSuccess }: NFTDetailProps) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [imageError, setImageError] = useState(false);

  const imageUrl = getNFTImageUrl(nft.display);
  const name = nft.display.name || 'Unnamed NFT';
  const description = nft.display.description;
  const collection = getCollectionFromType(nft.type);
  const creator = nft.display.creator;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleTransferSuccess = (digest: string) => {
    setShowTransfer(false);
    onTransferSuccess?.(digest);
    onClose();
  };

  // Transfer view
  if (showTransfer) {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={handleBackdropClick}
      >
        <div className="bg-zinc-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <NFTTransfer
            nft={nft}
            onClose={() => setShowTransfer(false)}
            onSuccess={handleTransferSuccess}
          />
        </div>
      </div>
    );
  }

  // Detail view
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-900 rounded-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-medium text-white truncate">{name}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className="bg-zinc-800 h-[280px] flex items-center justify-center">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={name}
              className="max-w-full max-h-full object-contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <svg
              className="w-20 h-20 text-zinc-600"
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
          )}
        </div>

        {/* Details */}
        <div className="p-4 space-y-3">
          {/* Collection */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Collection</p>
            <p className="text-sm text-white mt-1">{collection}</p>
          </div>

          {/* Description */}
          {description && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Description</p>
              <p className="text-sm text-zinc-300 mt-1 line-clamp-2">{description}</p>
            </div>
          )}

          {/* Creator */}
          {creator && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Creator</p>
              <p className="text-sm text-white mt-1">{creator}</p>
            </div>
          )}

          {/* Object ID */}
          <CopyableAddress
            value={nft.objectId}
            label="Object ID"
            shorten={10}
            showCopy
            showExplorer
            explorerType="object"
          />
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <button
            onClick={() => setShowTransfer(true)}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Transfer
          </button>
          <a
            href={getExplorerObjectUrl(nft.objectId)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Explorer
          </a>
        </div>
      </div>
    </div>
  );
}
