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
  shortenAddress,
  getAllTokens,
  getTokenByType,
  NATIVE_TOKEN,
} from '@nasun/wallet';
import { TokenSelector } from './TokenSelector';

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

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(defaultToken);
  const [showConfirm, setShowConfirm] = useState(false);

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
      <div className="p-4 bg-zinc-800 rounded-lg">
        <p className="text-zinc-400 text-sm">Please connect your wallet first.</p>
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
      <div className="p-4 bg-zinc-800 rounded-lg min-w-[320px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-white">Transfer Complete</h3>
            <p className="text-sm text-zinc-400 mt-1">
              {lastResult.amount} {successToken} sent successfully
            </p>
          </div>

          <div className="w-full bg-zinc-700 rounded p-3">
            <p className="text-xs text-zinc-400">Transaction Digest</p>
            <p className="text-sm text-white font-mono break-all mt-1">{lastResult.digest}</p>
            {/* Explorer link */}
            <a
              href={`https://explorer.devnet.nasun.io/txblock/${lastResult.digest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block"
            >
              View in Explorer →
            </a>
          </div>

          <div className="flex gap-2 w-full">
            <button
              onClick={() => {
                clearResult();
                setRecipient('');
                setAmount('');
              }}
              className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm transition-colors"
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

  // Confirmation screen
  if (showConfirm) {
    return (
      <div className="p-4 bg-zinc-800 rounded-lg min-w-[320px]">
        <h3 className="text-lg font-medium text-white mb-4">Confirm Transfer</h3>

        <div className="space-y-3 mb-4">
          <div className="bg-zinc-700 rounded p-3">
            <p className="text-xs text-zinc-400">Recipient Address</p>
            <p className="text-sm text-white font-mono mt-1">{shortenAddress(recipient, 8)}</p>
          </div>

          <div className="bg-zinc-700 rounded p-3">
            <p className="text-xs text-zinc-400">Amount</p>
            <p className="text-lg text-white font-medium mt-1">
              {amount} <span className="text-blue-400 text-sm">{selectedToken}</span>
            </p>
          </div>

          {/* Gas warning for non-native tokens */}
          {selectedToken !== 'NASUN' && (
            <div className="bg-zinc-700/50 rounded p-3 border border-zinc-600">
              <p className="text-xs text-zinc-400">
                Gas Fee: paid in <span className="text-blue-400">NASUN</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Available: {getNativeBalance().toFixed(4)} NASUN
              </p>
            </div>
          )}
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
            className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white rounded text-sm transition-colors"
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
                  onSuccess?.(result.digest);
                }
              } catch {
                // Error is stored in state
              }
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded text-sm transition-colors"
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
    <div className="p-4 bg-zinc-800 rounded-lg min-w-[320px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">Send Token</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
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
          <label className="block text-sm text-zinc-400 mb-1">Token</label>
          <TokenSelector
            value={selectedToken}
            onChange={setSelectedToken}
            showBalance={true}
          />
        </div>

        {/* Balance display */}
        <div className="bg-zinc-700/50 rounded p-3">
          <p className="text-xs text-zinc-400">Available Balance</p>
          <p className="text-lg text-white font-medium mt-1">
            {getSelectedBalance()}{' '}
            <span className="text-blue-400 text-sm">{selectedToken}</span>
          </p>
        </div>

        {/* Gas warning */}
        {!hasEnoughGas && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <p className="text-sm text-yellow-400">
              Insufficient NASUN for gas fees. You need at least {MIN_GAS_BALANCE} NASUN.
            </p>
          </div>
        )}

        {/* Recipient address */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className={`w-full px-3 py-2 bg-zinc-700 border rounded text-white text-sm font-mono focus:outline-none transition-colors ${
              !isValidRecipient
                ? 'border-red-500 focus:border-red-500'
                : 'border-zinc-600 focus:ring-2 focus:ring-blue-500'
            }`}
          />
          {!isValidRecipient && (
            <p className="text-xs text-red-400 mt-1">Invalid address format</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Amount ({selectedToken})</label>
          <input
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.0001"
            min="0"
            className={`w-full px-3 py-2 bg-zinc-700 border rounded text-white text-sm focus:outline-none transition-colors ${
              !isValidAmount
                ? 'border-red-500 focus:border-red-500'
                : 'border-zinc-600 focus:ring-2 focus:ring-blue-500'
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
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-600 disabled:text-zinc-400 text-white font-medium rounded transition-colors"
        >
          Send {selectedToken}
        </button>
      </div>
    </div>
  );
}
