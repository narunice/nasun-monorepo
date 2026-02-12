/**
 * ReceivePanel Component
 * Display QR code and generate payment links for receiving tokens
 */

import { useState, useEffect } from 'react';
import { usePaymentQR, usePaymentLink, getAllTokens, useSigner, useChain } from '@nasun/wallet';
import { CopyableAddress } from '../address/CopyableAddress';
import { TokenSelector } from '../balance/TokenSelector';
import { PanelHeader } from '../shared';

interface ReceivePanelProps {
  onClose?: () => void;
}

export function ReceivePanel({ onClose }: ReceivePanelProps) {
  const { address } = useSigner();
  const { chain, isEVM, isExternalMove } = useChain();
  const defaultToken = (isEVM || isExternalMove) ? chain.nativeCurrency.symbol : 'NSN';
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(defaultToken);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const { dataUrl, generate, isLoading: qrLoading, error: qrError } = usePaymentQR({
    size: 200,
    errorCorrectionLevel: 'M',
  });

  const { generateLink, isGenerating, error: linkError } = usePaymentLink();

  // Chain-aware token list
  const tokens = (isEVM || isExternalMove)
    ? [{
        symbol: chain.nativeCurrency.symbol,
        name: chain.nativeCurrency.name,
        decimals: chain.nativeCurrency.decimals,
        type: isEVM ? 'native' : (chain.nativeCoinType ?? '0x2::sui::SUI'),
      }]
    : getAllTokens();

  // Reset selected token when chain changes
  useEffect(() => {
    setSelectedToken(defaultToken);
  }, [defaultToken]);

  // Generate QR code for current address on mount
  useEffect(() => {
    if (address) {
      generate(address);
    }
  }, [address, generate]);

  // Generate payment link when amount changes
  useEffect(() => {
    if (amount && parseFloat(amount) > 0 && address) {
      generateLink({
        amount,
        token: selectedToken,
      }).then((link) => {
        setPaymentLink(link.url);
        // Regenerate QR with payment link
        generate(link.url);
      }).catch(() => {
        // Error handled by hook
      });
    } else if (address) {
      setPaymentLink(null);
      // Reset to address-only QR
      generate(address);
    }
  }, [amount, selectedToken, address, generateLink, generate]);

  const handleCopyLink = async () => {
    const textToCopy = paymentLink || address;
    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    }
  };

  const handleShare = async () => {
    const textToShare = paymentLink || address;
    if (textToShare && navigator.share) {
      try {
        await navigator.share({
          title: 'Nasun Wallet',
          text: paymentLink
            ? `Send me ${amount} ${selectedToken}`
            : 'My Nasun address',
          url: textToShare,
        });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  if (!address) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg">
        <p className="text-gray-500 dark:text-zinc-400 text-sm xl:text-base">
          Please connect your wallet first.
        </p>
      </div>
    );
  }

  const error = qrError || linkError;

  return (
    <div className="p-4 w-full">
      <PanelHeader
        title="Receive"
        onClose={onClose}
        titleIcon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
        }
      />

      {/* QR Code */}
      <div className="flex justify-center mb-4">
        <div className="p-3 bg-white rounded-lg">
          {qrLoading || isGenerating ? (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dataUrl ? (
            <img src={dataUrl} alt="Payment QR Code" className="w-[200px] h-[200px]" />
          ) : (
            <div className="w-[200px] h-[200px] bg-gray-100 flex items-center justify-center text-gray-400">
              QR Code
            </div>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="mb-4">
        <CopyableAddress
          value={address}
          shorten={10}
          showCopy
          showExplorer
          explorerType="address"
          size="sm"
        />
      </div>

      {/* Optional Amount */}
      <div className="space-y-3 mb-4">
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          Optional: Request specific amount
        </p>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <TokenSelector
            value={selectedToken}
            onChange={setSelectedToken}
            tokens={tokens}
            showBalance={false}
          />
        </div>

        {paymentLink && (
          <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-xs xl:text-sm text-green-600 dark:text-green-400">
              Payment link ready ({amount} {selectedToken})
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <p className="text-sm xl:text-base text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopyLink}
          className={`flex-1 px-4 py-2 text-sm xl:text-base font-medium rounded transition-colors flex items-center justify-center gap-2 ${
            copySuccess
              ? 'bg-green-600 text-white'
              : 'bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-zinc-600'
          }`}
        >
          {copySuccess ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy {paymentLink ? 'Link' : 'Address'}
            </>
          )}
        </button>

        {typeof navigator.share === 'function' && (
          <button
            onClick={handleShare}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm xl:text-base font-medium rounded transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            Share
          </button>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-gray-100 dark:bg-zinc-700/50 rounded">
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          {paymentLink
            ? 'Share this link to request a specific payment amount.'
            : 'Scan this QR code or share your address to receive tokens.'}
        </p>
      </div>
    </div>
  );
}
