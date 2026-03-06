/**
 * NFT Detail Component
 * Modal displaying full NFT information with transfer option
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  type NFTInfo,
  getNFTImageUrl,
  getCollectionFromType,
  getExplorerObjectUrl,
} from '@nasun/wallet';
import { NFTTransfer } from './NFTTransfer';
import { CopyableAddress } from '../address/CopyableAddress';

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

  // Close on Escape key (capture phase to prevent wallet dropdown from also closing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
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

  // Render modal via Portal to escape wallet dropdown's overflow/transform constraints
  const modalContent = showTransfer ? (
    <div
      data-wallet-portal="true"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100000] p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <NFTTransfer
          nft={nft}
          onClose={() => setShowTransfer(false)}
          onSuccess={handleTransferSuccess}
        />
      </div>
    </div>
  ) : (
    <div
      data-wallet-portal="true"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100000] p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h2 className="text-lg xl:text-xl font-medium text-gray-900 dark:text-white truncate">{name}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className="bg-gray-100 dark:bg-zinc-800 h-[280px] flex items-center justify-center">
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={name}
              className="max-w-full max-h-full object-contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <svg
              className="w-20 h-20 text-gray-400 dark:text-zinc-500"
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
            <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Collection</p>
            <p className="text-sm xl:text-base text-gray-900 dark:text-white mt-1">{collection}</p>
          </div>

          {/* Description */}
          {description && (
            <div>
              <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Description</p>
              <p className="text-sm xl:text-base text-gray-600 dark:text-zinc-300 mt-1 line-clamp-2">{description}</p>
            </div>
          )}

          {/* Creator */}
          {creator && (
            <div>
              <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Creator</p>
              <p className="text-sm xl:text-base text-gray-900 dark:text-white mt-1">{creator}</p>
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
        <div className="p-4 border-t border-gray-200 dark:border-zinc-700 flex gap-3">
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
            className="px-4 py-2.5 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-2"
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

  return createPortal(modalContent, document.body);
}
