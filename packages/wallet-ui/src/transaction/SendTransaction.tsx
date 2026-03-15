/**
 * Nasun Wallet Token Transfer UI
 * Supports multi-token transfers (NSN, NBTC, NUSDC, etc.)
 * Enhanced with Clear Signing UI elements for transaction clarity
 */

import { useState, useEffect } from 'react';
import {
  useTokenTransaction,
  useEVMTransaction,
  useMultiBalance,
  useBalance,
  useWallet,
  useZkLogin,
  usePasskey,
  useLedger,
  useChain,
  useEVMBalance,
  useEVMGasEstimate,
  useERC20Balances,
  getStoredEVMAddress,
  isValidAddress,
  getAllTokens,
  getTokenByType,
  getAllERC20Tokens,
  NATIVE_TOKEN,
  useAddressStatus,
  useAddressBook,
  type TokenConfig,
} from '@nasun/wallet';
import { TokenSelector } from '../balance/TokenSelector';
import { CopyableAddress } from '../address/CopyableAddress';
import { LedgerSigningPrompt } from '../ledger';
import { StatusBadge } from '../clear-signing';
import { Tooltip, PanelHeader } from '../shared';

interface SendTransactionProps {
  onClose?: () => void;
  onSuccess?: (digest: string) => void;
  // Initial token symbol (defaults to NSN)
  defaultToken?: string;
  // Initial recipient address (from Address Book)
  initialRecipient?: string;
  // Navigate to address book view to pick a recipient
  onAddressBook?: () => void;
}

// Minimum gas balance required for non-native token transfers
const MIN_GAS_BALANCE = 0.01;

export function SendTransaction({ onClose, onSuccess, defaultToken, initialRecipient, onAddressBook }: SendTransactionProps) {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const { isUnlocked: isPasskeyUnlocked, address: passkeyAddress } = usePasskey();
  const { isConnected: isLedgerConnected } = useLedger();
  const { chain, isEVM, isExternalMove } = useChain();
  const { data: balances } = useMultiBalance();
  const { data: moveNativeBalance } = useBalance(undefined, { enabled: isExternalMove });

  // Move chain transaction hook
  const {
    sendTokenTransaction,
    isPending: isMovesPending,
    error: moveError,
    lastResult: moveLastResult,
    clearError: clearMoveError,
    clearResult: clearMoveResult,
  } = useTokenTransaction();

  // EVM chain transaction hook
  const {
    sendTransfer: sendEVMTransfer,
    sendERC20Transfer,
    isPending: isEVMPending,
    error: evmError,
    lastResult: evmLastResult,
    clearError: clearEVMError,
    clearResult: clearEVMResult,
  } = useEVMTransaction();

  // Unified state based on chain type
  const isPending = isEVM ? isEVMPending : isMovesPending;
  const error = isEVM ? evmError : moveError;
  const clearError = isEVM ? clearEVMError : clearMoveError;
  const clearResult = isEVM ? clearEVMResult : clearMoveResult;

  // Unified last result - compute after amount is available
  const getLastResult = () => {
    if (isEVM && evmLastResult) {
      return {
        status: evmLastResult.status,
        digest: evmLastResult.hash,
      };
    }
    return moveLastResult;
  };
  const lastResult = getLastResult();

  const { recordTransaction } = useAddressBook();

  // Get connected address (Move chain) and EVM address
  const connectedAddress = account?.address || zkState?.address || passkeyAddress;
  const storedEVMAddress = isEVM ? getStoredEVMAddress() : null;
  const evmAddressForBalance = storedEVMAddress ?? undefined;

  // EVM balance (only fetched when on EVM chain with EVM address)
  const { balance: evmBalance } = useEVMBalance(evmAddressForBalance);

  // EVM gas estimate (real-time gas price)
  const { data: gasEstimate, isLoading: isGasLoading } = useEVMGasEstimate();

  // ERC-20 balances (only fetched on EVM chains)
  const { balances: erc20Balances } = useERC20Balances(evmAddressForBalance);

  // Get chain-specific tokens
  const getChainTokens = (): TokenConfig[] => {
    if (isEVM) {
      // EVM chain: native currency + ERC-20 tokens
      const nativeToken: TokenConfig = {
        symbol: chain.nativeCurrency.symbol,
        name: chain.nativeCurrency.name,
        decimals: chain.nativeCurrency.decimals,
        type: 'native',
      };
      const erc20Tokens = getAllERC20Tokens(chain.id).map((t) => ({
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        type: t.address, // Use contract address as type identifier
      }));
      return [nativeToken, ...erc20Tokens];
    }
    if (isExternalMove) {
      // External Move chain: native token only (SUI, IOTA)
      return [{
        symbol: chain.nativeCurrency.symbol,
        name: chain.nativeCurrency.name,
        decimals: chain.nativeCurrency.decimals,
        type: chain.nativeCoinType ?? '0x2::sui::SUI',
      }];
    }
    // Nasun chain: show registered tokens
    return getAllTokens();
  };

  // Chain-aware address validation
  const isValidChainAddress = (address: string): boolean => {
    if (!address) return false;
    if (isEVM) {
      // EVM address: 0x + 40 hex chars
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    // Sui/Nasun address: 0x + 64 hex chars
    return isValidAddress(address);
  };

  const tokens = getChainTokens();
  const chainDefaultToken = (isEVM || isExternalMove) ? chain.nativeCurrency.symbol : 'NSN';

  const [recipient, setRecipient] = useState(initialRecipient || '');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(defaultToken || chainDefaultToken);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLedgerSigning, setIsLedgerSigning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Update selected token when chain changes
  useEffect(() => {
    // If current token is not available on the new chain, switch to default
    const tokenExists = tokens.some((t) => t.symbol === selectedToken);
    if (!tokenExists) {
      setSelectedToken(chainDefaultToken);
    }
  }, [chain.id, tokens, selectedToken, chainDefaultToken]);

  // Address book status (must be after recipient state declaration)
  const addressStatus = useAddressStatus(recipient);

  // Get selected token config
  const tokenConfig = tokens.find((t) => t.symbol === selectedToken) || tokens[0] || NATIVE_TOKEN;

  // Check if selected token is an ERC-20 (not native)
  const isERC20Selected = isEVM && tokenConfig.type !== 'native';

  // Get balance for selected token (chain-aware)
  const getSelectedBalance = (): string => {
    if (isEVM) {
      if (isERC20Selected) {
        // Look up ERC-20 balance
        const erc20 = erc20Balances.find(
          (b) => b.address.toLowerCase() === tokenConfig.type.toLowerCase()
        );
        return erc20?.formattedBalance || '0';
      }
      return evmBalance?.formatted || '0';
    }
    if (isExternalMove) {
      return moveNativeBalance?.formattedBalance || '0';
    }
    // Nasun chain: use multi-balance
    if (!balances) return '0';
    if (selectedToken === 'NSN') return balances.native.formatted;
    return balances.tokens[selectedToken]?.formatted || '0';
  };

  // Get native balance for gas check (chain-aware)
  const getNativeBalance = (): number => {
    if (isEVM) {
      return evmBalance ? parseFloat(evmBalance.formatted) : 0;
    }
    if (isExternalMove) {
      return moveNativeBalance ? parseFloat(moveNativeBalance.formattedBalance) : 0;
    }
    if (!balances) return 0;
    return parseFloat(balances.native.formatted);
  };

  // Check if we have enough gas for non-native token transfers
  const nativeSymbol = (isEVM || isExternalMove) ? chain.nativeCurrency.symbol : 'NSN';
  const hasEnoughGas = selectedToken === nativeSymbol || getNativeBalance() >= MIN_GAS_BALANCE;

  // Check if connected via traditional wallet, zkLogin, or passkey
  const isWalletConnected = (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked;

  // Wallet not connected
  if (!isWalletConnected || !connectedAddress) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-zinc-800 rounded-lg">
        <p className="text-gray-500 dark:text-zinc-400 text-sm xl:text-base">Please connect your wallet first.</p>
      </div>
    );
  }

  // Success result display
  if (lastResult?.status === 'success') {
    // Get token info from result if available (Move chain has tokenType, EVM doesn't)
    const successToken = isEVM
      ? selectedToken
      : 'tokenType' in lastResult && lastResult.tokenType
        ? getTokenByType(lastResult.tokenType)?.symbol || selectedToken
        : selectedToken;

    // Get amount from result (Move) or state (EVM)
    const successAmount = 'amount' in lastResult ? lastResult.amount : amount;

    return (
      <div className="p-4 w-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Transfer Complete</h3>
            <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400 mt-1">
              {successAmount} {successToken} sent successfully
            </p>
            <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 mt-1">
              on {chain.name}
            </p>
          </div>

          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <CopyableAddress
              value={lastResult.digest}
              label="Transaction Digest"
              shorten={8}
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
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded text-sm xl:text-base transition-colors"
            >
              New Transfer
            </button>
            {onClose && (
              <button
                onClick={() => {
                  clearResult();
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors"
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
  const isNewAddress = isValidChainAddress(recipient) && !addressStatus.isKnown;

  // Determine risk level for Clear Signing status badge
  const getRiskLevel = () => {
    if (addressStatus.entry?.isTrusted) return 'low' as const;
    if (addressStatus.isKnown) return 'low' as const;
    return 'medium' as const;
  };

  // Confirmation screen
  if (showConfirm) {
    const riskLevel = getRiskLevel();

    return (
      <div className="p-4 w-full">
        {/* Header with Status Badge */}
        <PanelHeader title="Confirm Transfer" rightExtra={<StatusBadge level={riskLevel} variant="compact" />} />

        <div className="space-y-3 mb-4">
          {/* New address warning */}
          {isNewAddress && (
            <div className="p-3 bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm xl:text-base font-medium text-yellow-700 dark:text-yellow-400">
                    First-time recipient
                  </p>
                  <p className="text-xs xl:text-sm text-yellow-600 dark:text-yellow-500 mt-1">
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
              <p className="text-xs xl:text-sm text-green-600 dark:text-green-400 mt-1">
                ✓ {addressStatus.entry.transactionCount} previous transaction{addressStatus.entry.transactionCount > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="bg-gray-200 dark:bg-zinc-700 rounded p-3">
            <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">Amount</p>
            <p className="text-lg xl:text-xl text-gray-900 dark:text-white font-medium mt-1">
              {amount} <span className="text-blue-400 text-sm xl:text-base">{selectedToken}</span>
            </p>
          </div>

          {/* Gas fee estimation */}
          <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded p-3 border border-gray-300 dark:border-zinc-600">
            <p className="text-xs md:text-sm xl:text-base text-gray-500 dark:text-zinc-400">
              Estimated Gas Fee
            </p>
            <p className="text-sm xl:text-base text-gray-900 dark:text-white mt-1">
              {isEVM ? (
                isGasLoading ? (
                  <span className="text-gray-500 dark:text-zinc-400">Loading...</span>
                ) : gasEstimate ? (
                  <>≈ {gasEstimate.estimatedTransferFee} <span className="text-blue-400">{gasEstimate.symbol}</span>
                    <span className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 ml-2">
                      ({gasEstimate.gasPriceGwei} gwei)
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-zinc-400">Unable to estimate</span>
                )
              ) : (
                <>≈ 0.003 <span className="text-blue-400">{nativeSymbol}</span></>
              )}
            </p>
            {selectedToken !== nativeSymbol && (
              <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 mt-1">
                Available for gas: {getNativeBalance().toFixed(4)} {nativeSymbol}
              </p>
            )}
          </div>

          {/* Expandable Transaction Details */}
          <div className="border-t border-gray-300 dark:border-zinc-600 pt-2">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowDetails(!showDetails)}
              onKeyDown={(e) => e.key === 'Enter' && setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors py-1 cursor-pointer"
            >
              <span className="flex items-center gap-1">
                Transaction Details
                <Tooltip content="Technical information about this transaction" size="xs" />
              </span>
              <span className="text-xs xl:text-sm">{showDetails ? '▲' : '▼'}</span>
            </div>

            {showDetails && (
              <div className="mt-2 space-y-2 text-xs xl:text-sm bg-gray-200/50 dark:bg-zinc-700/50 rounded p-3">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">Type</span>
                  <span className="text-gray-900 dark:text-white">Token Transfer</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">Token</span>
                  <span className="text-gray-900 dark:text-white font-mono">{selectedToken}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">Network</span>
                  <span className="text-gray-900 dark:text-white">{chain.name}</span>
                </div>
                {selectedToken !== 'NSN' && !isEVM && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Token Type</span>
                    <span className="text-gray-900 dark:text-white font-mono text-[10px] xl:text-xs truncate max-w-[180px]">
                      {tokenConfig.type}
                    </span>
                  </div>
                )}
                {isERC20Selected && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Contract</span>
                    <span className="text-gray-900 dark:text-white font-mono text-[10px] xl:text-xs truncate max-w-[180px]">
                      {tokenConfig.type}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-zinc-400">Sender</span>
                  <span className="text-gray-900 dark:text-white font-mono">
                    {(() => {
                      const senderAddr = isEVM ? storedEVMAddress : connectedAddress;
                      return senderAddr ? `${senderAddr.slice(0, 8)}...${senderAddr.slice(-6)}` : '-';
                    })()}
                  </span>
                </div>
                {addressStatus.entry?.isTrusted && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-zinc-400">Recipient Status</span>
                    <span className="text-green-600 dark:text-green-400">Trusted Address</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-sm xl:text-base text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowConfirm(false);
              clearError();
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 disabled:bg-gray-300 dark:disabled:bg-zinc-800 text-gray-900 dark:text-white rounded text-sm xl:text-base transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              try {
                // Show Ledger signing prompt if using hardware wallet
                if (isLedgerConnected) {
                  setIsLedgerSigning(true);
                }

                if (isEVM) {
                  // EVM chain: native or ERC-20 transfer
                  const result = isERC20Selected
                    ? await sendERC20Transfer({
                        to: recipient,
                        tokenAddress: tokenConfig.type,
                        amount,
                        decimals: tokenConfig.decimals,
                      })
                    : await sendEVMTransfer({
                        to: recipient,
                        amount,
                      });
                  if (result.status === 'success') {
                    recordTransaction(recipient);
                    onSuccess?.(result.hash);
                  }
                } else {
                  // Move chain: use token transaction
                  const result = await sendTokenTransaction({
                    to: recipient,
                    amount,
                    tokenType: tokenConfig.type,
                  });
                  if (result.status === 'success') {
                    recordTransaction(recipient);
                    onSuccess?.(result.digest);
                  }
                }
              } catch {
                // Error is stored in state
              } finally {
                setIsLedgerSigning(false);
              }
            }}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-zinc-600 disabled:text-gray-200 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            {isPending ? 'Sending...' : 'Confirm'}
          </button>
        </div>

        {/* Ledger signing prompt overlay */}
        <LedgerSigningPrompt
          isOpen={isLedgerSigning}
          signingType="transaction"
          onCancel={() => setIsLedgerSigning(false)}
          cancellable={false}
        />
      </div>
    );
  }

  // Input form
  const isValidRecipient = recipient.length === 0 || isValidChainAddress(recipient);
  const isValidAmount = amount.length === 0 || (parseFloat(amount) > 0 && !isNaN(parseFloat(amount)));
  const availableBalance = parseFloat(getSelectedBalance() || '0');
  const enteredAmount = parseFloat(amount) || 0;
  const hasEnoughBalance = enteredAmount <= availableBalance;
  const canSubmit = isValidChainAddress(recipient) && parseFloat(amount) > 0 && hasEnoughGas && hasEnoughBalance;

  return (
    <div className="p-4 w-full">
      <PanelHeader title="Send Token" onBack={onClose} />

      <div className="space-y-4">
        {/* Token selector */}
        <div>
          <label className="block text-sm xl:text-base text-gray-500 dark:text-zinc-400 mb-1">Token</label>
          <TokenSelector
            value={selectedToken}
            onChange={setSelectedToken}
            tokens={tokens}
            showBalance={true}
          />
        </div>

        {/* Balance display */}
        <div className="bg-gray-200/50 dark:bg-zinc-700/50 rounded p-3">
          <p className="text-xs md:text-sm xl:text-base text-gray-500 dark:text-zinc-400">Available Balance</p>
          <p className="text-lg xl:text-xl text-gray-900 dark:text-white font-medium mt-1">
            {getSelectedBalance()}{' '}
            <span className="text-blue-400 text-sm xl:text-base">{selectedToken}</span>
          </p>
        </div>

        {/* Gas warning */}
        {!hasEnoughGas && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <p className="text-sm xl:text-base text-yellow-600 dark:text-yellow-400">
              Insufficient {nativeSymbol} for gas fees. You need at least {MIN_GAS_BALANCE} {nativeSymbol}.
            </p>
          </div>
        )}

        {/* Recipient address */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">Recipient Address</label>
            {onAddressBook && (
              <button
                type="button"
                onClick={onAddressBook}
                className="p-1 text-gray-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded"
                title="Address Book"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className={`w-full px-3 py-2 bg-gray-200 dark:bg-zinc-700 border rounded text-gray-900 dark:text-white text-sm xl:text-base font-mono focus:outline-none transition-colors ${
              !isValidRecipient
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500'
            }`}
          />
          {!isValidRecipient && (
            <p className="text-xs xl:text-sm text-red-400 mt-1">Invalid address format</p>
          )}
          {isValidChainAddress(recipient) && addressStatus.isKnown && addressStatus.entry && (
            <p className="text-xs xl:text-sm text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Known address ({addressStatus.entry.transactionCount} tx)
              {addressStatus.entry.label && ` - ${addressStatus.entry.label}`}
            </p>
          )}
          {isNewAddress && (
            <p className="text-xs xl:text-sm text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              New address - verify before sending
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm xl:text-base text-gray-500 dark:text-zinc-400 mb-1">Amount ({selectedToken})</label>
          <input
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && setShowConfirm(true)}
            onWheel={(e) => e.currentTarget.blur()}
            step="0.0001"
            min="0"
            className={`w-full px-3 py-2 bg-gray-200 dark:bg-zinc-700 border rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none transition-colors ${
              !isValidAmount
                ? 'border-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500'
            }`}
          />
          {/* Percentage amount buttons */}
          <div className="flex gap-1.5 mt-1.5">
            {([25, 50, 75] as const).map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={availableBalance <= 0}
                onClick={() => {
                  // Floor to 4 decimals to prevent sending more than available
                  const value = Math.floor(availableBalance * pct / 100 * 10000) / 10000;
                  setAmount(value.toString());
                }}
                className="flex-1 py-1 text-xs xl:text-sm bg-gray-100 dark:bg-zinc-600 hover:bg-gray-200 dark:hover:bg-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-zinc-300 rounded transition-colors"
              >
                {pct}%
              </button>
            ))}
            <button
              type="button"
              disabled={availableBalance <= 0}
              onClick={() => {
                const isNative = selectedToken === nativeSymbol;
                const raw = isNative
                  ? Math.max(0, availableBalance - MIN_GAS_BALANCE)
                  : availableBalance;
                // Floor to 4 decimals to prevent sending more than available
                const maxAmount = Math.floor(raw * 10000) / 10000;
                setAmount(maxAmount.toString());
              }}
              className="flex-1 py-1 text-xs xl:text-sm bg-gray-100 dark:bg-zinc-600 hover:bg-gray-200 dark:hover:bg-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-zinc-300 rounded transition-colors font-medium"
            >
              MAX
            </button>
          </div>
          {!isValidAmount && (
            <p className="text-xs xl:text-sm text-red-400 mt-1">Please enter a valid amount</p>
          )}
          {isValidAmount && amount && !hasEnoughBalance && (
            <p className="text-xs xl:text-sm text-red-400 mt-1">
              Insufficient balance. Available: {getSelectedBalance()} {selectedToken}
            </p>
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
