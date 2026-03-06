/**
 * NFT Transfer Component
 * Transfer an NFT to another address
 */

import { useState } from 'react';
import {
  type NFTInfo,
  useNFTTransfer,
  isValidAddress,
  shortenAddress,
  getNFTImageUrl,
} from '@nasun/wallet';
import { CopyableAddress } from '../address/CopyableAddress';

interface NFTTransferProps {
  /** NFT to transfer */
  nft: NFTInfo;
  /** Close handler */
  onClose: () => void;
  /** Success callback with transaction digest */
  onSuccess?: (digest: string) => void;
}

export function NFTTransfer({ nft, onClose, onSuccess }: NFTTransferProps) {
  const { transferNFT, isPending, error, lastResult, clearError, clearResult } = useNFTTransfer();
  const [recipient, setRecipient] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const imageUrl = getNFTImageUrl(nft.display);
  const name = nft.display.name || 'Unnamed NFT';

  // Validation
  const isValidRecipient = recipient.length === 0 || isValidAddress(recipient);
  const canSubmit = isValidAddress(recipient);

  // Handle transfer
  const handleTransfer = async () => {
    try {
      const result = await transferNFT({
        objectId: nft.objectId,
        to: recipient,
      });
      if (result.status === 'success') {
        onSuccess?.(result.digest);
      }
    } catch {
      // Error is stored in state
    }
  };

  // Success view
  if (lastResult?.status === 'success') {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Transfer Complete</h3>
            <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400 mt-1">
              {name} has been sent successfully
            </p>
          </div>

          <div className="w-full bg-gray-100 dark:bg-zinc-700 rounded p-3">
            <CopyableAddress
              value={lastResult.digest}
              label="Transaction Digest"
              shorten={12}
              showCopy
              showExplorer
              explorerType="tx"
            />
          </div>

          <button
            onClick={() => {
              clearResult();
              onClose();
            }}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Confirmation view
  if (showConfirm) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Confirm Transfer</h3>
          <button
            onClick={() => {
              setShowConfirm(false);
              clearError();
            }}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* NFT Preview */}
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-800 rounded-lg p-3 mb-4">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-700 flex-shrink-0">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm xl:text-base font-medium text-gray-900 dark:text-white truncate">{name}</p>
            <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 font-mono">{shortenAddress(nft.objectId, 6)}</p>
          </div>
        </div>

        {/* Recipient */}
        <div className="bg-gray-50 dark:bg-zinc-800 rounded-lg p-3 mb-4">
          <CopyableAddress
            value={recipient}
            label="Sending to"
            shorten={10}
            showCopy
            showExplorer
            explorerType="address"
            size="xs"
          />
        </div>

        {/* Gas Fee */}
        <div className="bg-gray-100 dark:bg-zinc-700/50 rounded-lg p-3 mb-4 border border-gray-200 dark:border-zinc-600">
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Estimated Gas Fee</p>
          <p className="text-sm xl:text-base text-gray-900 dark:text-white mt-1">
            ≈ 0.003 <span className="text-blue-400">NSN</span>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-sm xl:text-base text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowConfirm(false);
              clearError();
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 disabled:bg-gray-200 dark:disabled:bg-zinc-800 text-gray-900 dark:text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded transition-colors"
          >
            {isPending ? 'Sending...' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Input form
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Transfer NFT</h3>
        <button
          onClick={onClose}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* NFT Preview */}
      <div className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-800 rounded-lg p-3 mb-4">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-700 flex-shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 font-mono">{shortenAddress(nft.objectId, 6)}</p>
        </div>
      </div>

      {/* Recipient Address */}
      <div className="mb-4">
        <label className="block text-sm xl:text-base text-gray-500 dark:text-zinc-400 mb-1">Recipient Address</label>
        <input
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && setShowConfirm(true)}
          className={`w-full px-3 py-2 bg-gray-50 dark:bg-zinc-700 border rounded text-gray-900 dark:text-white text-sm xl:text-base font-mono focus:outline-none transition-colors ${
            !isValidRecipient
              ? 'border-red-500 focus:border-red-500'
              : 'border-gray-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500'
          }`}
        />
        {!isValidRecipient && (
          <p className="text-xs xl:text-sm text-red-400 mt-1">Invalid address format</p>
        )}
      </div>

      {/* Warning */}
      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
        <p className="text-sm xl:text-base text-yellow-400">
          Please double-check the recipient address. NFT transfers cannot be reversed.
        </p>
      </div>

      {/* Submit Button */}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={!canSubmit}
        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
