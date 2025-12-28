/**
 * Nasun Wallet Token Transfer UI
 * Supports multi-token transfers (NASUN, NBTC, NUSDC, etc.)
 */

import { useState } from 'react';
import {
  useTokenTransaction,
  useMultiBalance,
  useWallet,
  isValidAddress,
  getAllTokens,
  getTokenByType,
  NATIVE_TOKEN,
  useAddressStatus,
  useAddressBook,
} from '@nasun/wallet';
import { TokenSelector } from './TokenSelector';
import { CopyableAddress } from './CopyableAddress';

interface SendTransactionProps {
  onClose?: () => void;
  onSuccess?: (digest: string) => void;
  // Initial token symbol (defaults to NASUN)
  defaultToken?: string;
}

// Minimum gas balance required for non-native token transfers
const MIN_GAS_BALANCE = 0.01;

export function SendTransaction({ onClose, onSuccess, defaultToken = 'NASUN' }: SendTransactionProps) {
  const { status, account } = useWallet();
  const { data: balances } = useMultiBalance();
  const { sendTokenTransaction, isPending, error, lastResult, clearError, clearResult } =
    useTokenTransaction();
  const { recordTransaction } = useAddressBook();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(defaultToken);
  const [showConfirm, setShowConfirm] = useState(false);

  // Address book status (must be after recipient state declaration)
  const addressStatus = useAddressStatus(recipient);

  // Get selected token config
  const tokens = getAllTokens();
  const tokenConfig = tokens.find((t) => t.symbol === selectedToken) || NATIVE_TOKEN;

  // Get balance for selected token
  const getSelectedBalance = (): string => {
    if (!balances) return '0';
    if (selectedToken === 'NASUN') return balances.native.formatted;
    return balances.tokens[selectedToken]?.formatted || '0';
  };

  // Get native balance for gas check
  const getNativeBalance = (): number => {
    if (!balances) return 0;
    return parseFloat(balances.native.formatted);
  };

  // Check if we have enough gas for non-native token transfers
  const hasEnoughGas = selectedToken === 'NASUN' || getNativeBalance() >= MIN_GAS_BALANCE;

  // Wallet not connected
  if (status !== 'unlocked' || !account) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg">
        <p className="text-gray-500 dark:text-zinc-400 text-sm">Please connect your wallet first.</p>
      </div>
    );
  }

  // Success result display
  if (lastResult?.status === 'success') {
    // Get token info from result if available
    const successToken = lastResult.tokenType
      ? getTokenByType(lastResult.tokenType)?.symbol || selectedToken
      : selectedToken;

    return (
      <div className="p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg min-w-[320px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Transfer Complete</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              {lastResult.amount} {successToken} sent successfully
            </p>
          </div>

          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <CopyableAddress
              value={lastResult.digest}
              label="Transaction Digest"
              shorten={12}
              showCopy
              showExplorer
              explorerType="tx"
            />
          </div>

          <div className="flex gap-2 w-full">
            <button
              onClick={() => {
                clearResult();
                setRecipient('');
                setAmount('');
                setShowConfirm(false);
              }}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded text-sm transition-colors"
            >
              New Transfer
            </button>
            {onClose && (
              <button
                onClick={() => {
                  clearResult();
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Check if this is a new address (never sent to before)
  const isNewAddress = isValidAddress(recipient) && !addressStatus.isKnown;

  // Confirmation screen
  if (showConfirm) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg min-w-[320px]">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Confirm Transfer</h3>

        <div className="space-y-3 mb-4">
          {/* New address warning */}
          {isNewAddress && (
            <div className="p-3 bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    First-time recipient
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
                    You have never sent tokens to this address before. Please verify the address carefully.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <CopyableAddress
              value={recipient}
              label={addressStatus.entry?.label ? `${addressStatus.entry.label}` : 'Recipient Address'}
              shorten={8}
              showCopy
              showExplorer
              explorerType="address"
              size="xs"
            />
            {addressStatus.isKnown && addressStatus.entry && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                ✓ {addressStatus.entry.transactionCount} previous transaction{addressStatus.entry.transactionCount > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <p className="text-xs text-gray-500 dark:text-zinc-400">Amount</p>
            <p className="text-lg text-gray-900 dark:text-white font-medium mt-1">
              {amount} <span className="text-blue-400 text-sm">{selectedToken}</span>
            </p>
          </div>

          {/* Gas fee estimation */}
          <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded p-3 border border-gray-300 dark:border-zinc-600">
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Estimated Gas Fee
            </p>
            <p className="text-sm text-gray-900 dark:text-white mt-1">
              ≈ 0.003 <span className="text-blue-400">NASUN</span>
            </p>
            {selectedToken !== 'NASUN' && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                Available for gas: {getNativeBalance().toFixed(4)} NASUN
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowConfirm(false);
              clearError();
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 disabled:bg-gray-300 dark:disabled:bg-zinc-800 text-gray-900 dark:text-white rounded text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              try {
                const result = await sendTokenTransaction({
                  to: recipient,
                  amount,
                  tokenType: tokenConfig.type,
                });
                if (result.status === 'success') {
                  // Record transaction in address book
                  recordTransaction(recipient);
                  onSuccess?.(result.digest);
                }
              } catch {
                // Error is stored in state
              }
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-zinc-600 disabled:text-gray-200 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm transition-colors"
          >
            {isPending ? 'Sending...' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Input form
  const isValidRecipient = recipient.length === 0 || isValidAddress(recipient);
  const isValidAmount = amount.length === 0 || (parseFloat(amount) > 0 && !isNaN(parseFloat(amount)));
  const canSubmit = isValidAddress(recipient) && parseFloat(amount) > 0 && hasEnoughGas;

  return (
    <div className="p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg min-w-[320px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Send Token</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Token selector */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-zinc-400 mb-1">Token</label>
          <TokenSelector
            value={selectedToken}
            onChange={setSelectedToken}
            showBalance={true}
          />
        </div>

        {/* Balance display */}
        <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded p-3">
          <p className="text-xs text-gray-500 dark:text-zinc-400">Available Balance</p>
          <p className="text-lg text-gray-900 dark:text-white font-medium mt-1">
            {getSelectedBalance()}{' '}
            <span className="text-blue-400 text-sm">{selectedToken}</span>
          </p>
        </div>

        {/* Gas warning */}
        {!hasEnoughGas && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Insufficient NASUN for gas fees. You need at least {MIN_GAS_BALANCE} NASUN.
            </p>
          </div>
        )}

        {/* Recipient address */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-zinc-400 mb-1">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className={`w-full px-3 py-2 bg-gray-200 dark:bg-zinc-700 border rounded text-gray-900 dark:text-white text-sm font-mono focus:outline-none transition-colors ${
              !isValidRecipient
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500'
            }`}
          />
          {!isValidRecipient && (
            <p className="text-xs text-red-400 mt-1">Invalid address format</p>
          )}
          {isValidAddress(recipient) && addressStatus.isKnown && addressStatus.entry && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Known address ({addressStatus.entry.transactionCount} tx)
              {addressStatus.entry.label && ` - ${addressStatus.entry.label}`}
            </p>
          )}
          {isNewAddress && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              New address - verify before sending
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-zinc-400 mb-1">Amount ({selectedToken})</label>
          <input
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.0001"
            min="0"
            className={`w-full px-3 py-2 bg-gray-200 dark:bg-zinc-700 border rounded text-gray-900 dark:text-white text-sm focus:outline-none transition-colors ${
              !isValidAmount
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500'
            }`}
          />
          {!isValidAmount && (
            <p className="text-xs text-red-400 mt-1">Please enter a valid amount</p>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-zinc-600 disabled:text-gray-200 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors"
        >
          Send {selectedToken}
        </button>
      </div>
    </div>
  );
}
