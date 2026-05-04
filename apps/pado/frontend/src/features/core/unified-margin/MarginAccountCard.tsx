/**
 * MarginAccountCard
 *
 * UI component for Pado Balance account management
 * Shows balance, deposit/withdraw actions
 *
 * @version 0.2.0 - Renamed from "Unified Margin" to "Pado Balance"
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { formatErrorMessage } from '../../trading/utils/errorParser';
import { useWallet, useZkLogin, useMultiBalance, usePasskeyStore } from "@nasun/wallet";
import { useActiveAddress } from "../../../hooks/useActiveAddress";
import { useMarginAccount } from "./useMarginAccount";
import { usePadoAccount } from "./usePadoAccount";
import { WithdrawAllConfirmModal } from "./WithdrawAllConfirmModal";
import { useTrading } from "../../trading/useTrading";
import { useToast } from "@/components/common";
import { floatToRaw } from "../../../lib/unified-margin";
import { quoteBaseForQuote, recommendedSlippageBps, depositPoolFor, type SwapQuote } from "../../../lib/deepbook";
import { getUnifiedPrice, type TokenSymbol } from "../../../lib/prices";
import { TokenIcon } from "@/components/common";
import { TOKENS } from "../../../config/network";
import { PadoActivityCard } from "./PadoActivityCard";

type DepositTab = 'NUSDC' | 'NBTC' | 'NETH' | 'NSOL';
const DEPOSIT_TABS: DepositTab[] = ['NUSDC', 'NBTC', 'NETH', 'NSOL'];
const LAST_DEPOSIT_TOKEN_KEY = 'pado:lastDepositToken';

// Token decimal config (mirrors TOKENS in config/network.ts but locally typed
// to keep this module focused on UI concerns).
const TOKEN_DECIMALS: Record<DepositTab, number> = {
  NUSDC: 6,
  NBTC: 8,
  NETH: 8,
  NSOL: 9,
};

// Slippage presets in basis points (50 = 0.5%, 100 = 1%)
const SLIPPAGE_PRESETS = [50, 100] as const;

function isDepositTab(v: string | null): v is DepositTab {
  return v !== null && (DEPOSIT_TABS as readonly string[]).includes(v);
}

// Lightweight debounce - used only for the quote queryKey so typing bursts
// don't fan out into multiple stale queries.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// Format NUSDC amount (6 decimals)
function formatNusdc(amount: bigint | undefined): string {
  if (!amount) return "0.00";
  const value = Number(amount) / 1e6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function MarginAccountCard() {
  const navigate = useNavigate();
  const { status, account: walletAccount } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  // Bind balance query to the same address that will sign the deposit, so the
  // "Wallet" amount on this card matches the coin set we'll actually look up.
  // Without this, useMultiBalance falls back to a stale account.address even
  // when the user is signing via zkLogin/passkey, leading to "No NUSDC coins".
  const activeAddress = useActiveAddress();
  const { data: balances } = useMultiBalance({ address: activeAddress });

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const {
    account,
    hasAccount,
    createAccount,
    enablePado,
    depositByAmount,
    depositNbtc,
    depositSwap,
    withdraw,
    withdrawAllPado,
    isCreating,
    isEnabling,
    isDepositing,
    isWithdrawing,
    isLoading,
  } = useMarginAccount();
  const queryClient = useQueryClient();

  const padoAccount = usePadoAccount();

  // Trading for unified onboarding
  const { balanceManagerId, createBalanceManager, registerBalanceManager } = useTrading();

  const { showToast } = useToast();

  // Unified onboarding state
  const [isEnablingPado, setIsEnablingPado] = useState(false);

  // Unified onboarding: Enable Pado (BalanceManager + MarginAccount)
  // Single-PTB atomic creation when both are missing - no partial-state UX.
  // Legacy single-side users complete the pair via the appropriate single tx.
  const handleEnablePado = useCallback(async () => {
    setIsEnablingPado(true);
    try {
      const hasBm = !!balanceManagerId;
      const hasMa = hasAccount;

      if (!hasBm && !hasMa) {
        const { balanceManagerId: newBmId } = await enablePado();
        registerBalanceManager(newBmId);
        showToast("Pado enabled!", "success");
        navigate('/portfolio?tab=balance');
        return;
      }

      if (hasBm && !hasMa) {
        await createAccount();
        showToast("Pado enabled!", "success");
        navigate('/portfolio?tab=balance');
        return;
      }

      if (!hasBm && hasMa) {
        const result = await createBalanceManager();
        if (!result.success) {
          showToast(formatErrorMessage(result.error), "error");
          return;
        }
        showToast("Pado enabled!", "success");
        navigate('/portfolio?tab=balance');
        return;
      }

      // Already fully enabled
      showToast("Pado already enabled", "info");
    } catch (error) {
      showToast(formatErrorMessage(error), "error");
    } finally {
      setIsEnablingPado(false);
    }
  }, [enablePado, registerBalanceManager, hasAccount, balanceManagerId, createAccount, createBalanceManager, showToast]);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showWithdrawAllConfirm, setShowWithdrawAllConfirm] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [withdrawAllError, setWithdrawAllError] = useState<string | null>(null);
  const [showGasWarning, setShowGasWarning] = useState(false);

  // Deposit-tab state (multi-token)
  const [activeTab, setActiveTab] = useState<DepositTab>(() => {
    const last = typeof window !== 'undefined' ? localStorage.getItem(LAST_DEPOSIT_TOKEN_KEY) : null;
    return isDepositTab(last) ? last : 'NUSDC';
  });
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [customSlippage, setCustomSlippage] = useState<string>("");

  const isConnected = (status === "unlocked" && walletAccount) || isZkLoggedIn || isPasskeyUnlocked;

  // Get wallet balances per token (raw bigint)
  const tokenBalanceRaw: Record<DepositTab, bigint> = {
    NUSDC: balances?.tokens?.NUSDC?.balance ?? 0n,
    NBTC:  balances?.tokens?.NBTC?.balance  ?? 0n,
    NETH:  balances?.tokens?.NETH?.balance  ?? 0n,
    NSOL:  balances?.tokens?.NSOL?.balance  ?? 0n,
  };
  const nasunBalanceRaw = balances?.native?.balance ?? 0n;
  const walletNasunAmount = Number(nasunBalanceRaw) / 1e9;
  const MIN_GAS_RESERVE = 0.1; // Keep at least 0.1 NSN for gas

  // Persist last selected tab
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_DEPOSIT_TOKEN_KEY, activeTab);
    }
  }, [activeTab]);

  // Active tab decimal + balance helpers
  const activeDecimals = TOKEN_DECIMALS[activeTab];
  const activeBalanceRaw = tokenBalanceRaw[activeTab];
  const activeBalanceFloat = Number(activeBalanceRaw) / Math.pow(10, activeDecimals);

  // Parse the input amount once for downstream use
  const amountFloat = parseFloat(depositAmount);
  const amountValid = !isNaN(amountFloat) && amountFloat > 0;
  const amountRaw = amountValid ? floatToRaw(amountFloat, activeDecimals) : 0n;
  const debouncedAmountRaw = useDebouncedValue(amountRaw, 250);

  // Whether this tab needs swap routing
  const isSwapTab = activeTab === 'NETH' || activeTab === 'NSOL';

  // Live swap quote (NETH/NSOL only). 5s polling, debounced amount key.
  const { data: quote, error: quoteError } = useQuery<SwapQuote | null>({
    queryKey: ['deposit-quote', activeTab, debouncedAmountRaw.toString(), slippageBps],
    queryFn: () => {
      if (!isSwapTab || debouncedAmountRaw <= 0n) return null;
      const pool = depositPoolFor(activeTab);
      if (!pool) return null;
      return quoteBaseForQuote(pool, debouncedAmountRaw, activeDecimals, 6, slippageBps);
    },
    refetchInterval: 5_000,
    staleTime: 4_000,
    gcTime: 5_000,
    enabled: isSwapTab && debouncedAmountRaw > 0n,
    placeholderData: keepPreviousData,
  });

  // Auto-bump slippage to recommended value when impact rises (one-shot per quote)
  useEffect(() => {
    if (!quote) return;
    const recommended = recommendedSlippageBps(quote);
    if (recommended > slippageBps) setSlippageBps(recommended);
    // depositSwapMutation reads slippageBps via state; this effect only nudges up
  }, [quote, slippageBps]);

  // USD values for display (best-effort; oracle may be missing on devnet)
  const tokenSymbolForPrice: TokenSymbol = activeTab === 'NUSDC' ? 'NUSDC' : activeTab;
  const activePrice = getUnifiedPrice(tokenSymbolForPrice);
  const amountUsd = activePrice > 0 ? amountFloat * activePrice : null;
  const balanceUsd = activePrice > 0 ? activeBalanceFloat * activePrice : null;
  const expectedUsd = quote && quote.expectedQuoteRaw > 0n
    ? Number(quote.expectedQuoteRaw) / 1e6
    : null;
  const minReceivedFloat = quote ? Number(quote.minQuoteRaw) / 1e6 : null;

  // Reset deposit ephemeral state when modal closes/opens or tab changes
  const resetDepositState = useCallback(() => {
    setDepositAmount("");
    setError(null);
    setShowGasWarning(false);
    setSlippageBps(50);
    setCustomSlippage("");
  }, []);

  // Handle deposit - dispatches based on active tab
  const handleDeposit = async () => {
    setError(null);
    if (!amountValid) {
      setError("Please enter a valid amount");
      return;
    }
    if (amountRaw > activeBalanceRaw) {
      setError(`Insufficient ${activeTab} balance`);
      return;
    }

    try {
      if (activeTab === 'NUSDC') {
        await depositByAmount(amountRaw);
      } else if (activeTab === 'NBTC') {
        await depositNbtc(amountRaw);
      } else {
        // NETH/NSOL: refetch fresh quote then submit with its locked minQuoteOut
        const pool = depositPoolFor(activeTab);
        if (!pool) throw new Error(`No deposit pool for ${activeTab}`);
        const fresh = await queryClient.fetchQuery<SwapQuote | null>({
          queryKey: ['deposit-quote', activeTab, amountRaw.toString(), slippageBps, 'confirm'],
          queryFn: () => quoteBaseForQuote(pool, amountRaw, activeDecimals, 6, slippageBps),
        });
        if (!fresh) {
          setError("No liquidity for this trade right now. Try a different token or smaller amount.");
          return;
        }
        await depositSwap({
          fromSymbol: activeTab,
          rawAmount: amountRaw,
          minQuoteOut: fresh.minQuoteRaw,
        });
      }
      setShowDepositModal(false);
      resetDepositState();
    } catch (err) {
      setError(formatErrorMessage(err));
    }
  };

  // Handle withdraw all from Pado (BM + MA combined).
  // Returns success flag so caller can decide whether to close the confirm modal.
  const handleWithdrawAllPado = async (): Promise<{ success: boolean }> => {
    try {
      await withdrawAllPado();
      return { success: true };
    } catch (err) {
      setWithdrawAllError(err instanceof Error ? err.message : "Withdraw failed");
      return { success: false };
    }
  };

  // Handle withdraw
  const handleWithdraw = async () => {
    setError(null);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    const marginBalance = Number(account?.nusdcBalance || 0n) / 1e6;
    if (amount > marginBalance) {
      setError("Insufficient margin balance");
      return;
    }

    try {
      await withdraw(BigInt(Math.round(amount * 1e6)));
      setShowWithdrawModal(false);
      setWithdrawAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    }
  };

  // Not connected
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to manage Pado Balance
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-theme-bg-tertiary rounded w-1/3 mb-2"></div>
          <div className="h-8 bg-theme-bg-tertiary rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  // No account - show create button (unified onboarding)
  if (!hasAccount) {
    const isBusy = isEnablingPado || isEnabling || isCreating;
    // BM-only legacy users need only to add MA; new users need the full setup.
    const isLegacy = !!balanceManagerId;
    return (
      <div className="bg-gradient-to-r from-pd2/10 to-purple-500/10 border border-pd2/30 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-theme-text-primary">
              {isLegacy ? "Complete Pado Setup" : "Enable Pado"}
            </h3>
            <p className="text-sm text-theme-text-secondary mt-1">
              {isLegacy
                ? "Add a Margin Account to unlock Perp, Predictions, and unified balance"
                : "Enable Pado to use funds across Trading, Predictions, and more"}
            </p>
          </div>
          <button
            onClick={handleEnablePado}
            disabled={isBusy}
            className="px-4 py-2 bg-pd2 hover:bg-pd1 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isBusy ? "Setting up..." : isLegacy ? "Complete Setup" : "Enable Pado"}
          </button>
        </div>
      </div>
    );
  }

  // Has account - show balance and actions
  // Compute Pado balance composition (NUSDC + NBTC) in USD
  const totalNusdcUsd = Number(padoAccount.totalNusdcRaw) / Math.pow(10, TOKENS.NUSDC.decimals);
  const totalNbtcAmount = Number(padoAccount.totalNbtcRaw) / Math.pow(10, TOKENS.NBTC.decimals);
  const nbtcPriceForDisplay = getUnifiedPrice('NBTC');
  const totalNbtcUsd = totalNbtcAmount * nbtcPriceForDisplay;
  const totalPadoUsd = totalNusdcUsd + totalNbtcUsd;

  type PadoToken = {
    symbol: 'NUSDC' | 'NBTC';
    name: string;
    amount: number;
    usd: number;
    pct: number;
    barClass: string;
    dotClass: string;
  };
  const tokens: PadoToken[] = [];
  if (totalNusdcUsd > 0) {
    tokens.push({
      symbol: 'NUSDC',
      name: 'Nasun USDC',
      amount: totalNusdcUsd,
      usd: totalNusdcUsd,
      pct: totalPadoUsd > 0 ? (totalNusdcUsd / totalPadoUsd) * 100 : 0,
      barClass: 'bg-pd3',
      dotClass: 'bg-pd3',
    });
  }
  if (totalNbtcUsd > 0) {
    tokens.push({
      symbol: 'NBTC',
      name: 'Nasun BTC',
      amount: totalNbtcAmount,
      usd: totalNbtcUsd,
      pct: totalPadoUsd > 0 ? (totalNbtcUsd / totalPadoUsd) * 100 : 0,
      barClass: 'bg-yellow-500',
      dotClass: 'bg-yellow-500',
    });
  }

  const hasAnyPadoBalance =
    padoAccount.breakdown.bm.quoteRaw > 0n ||
    padoAccount.breakdown.bm.baseRaw > 0n ||
    padoAccount.breakdown.ma.nusdcRaw > 0n ||
    padoAccount.breakdown.ma.nbtcRaw > 0n;

  // Lifetime totals for the activity card "All time" preset.
  // total_deposited_usd / total_withdrawn_usd on the MarginAccount track NUSDC
  // 1:1 with USD (NBTC deposits are not folded in). The activity card uses
  // these for the All-time fast path; other periods query events.
  const lifetimeDepositedUsd = Number(account?.totalDepositedUsd ?? 0n) / 1e6;
  const lifetimeWithdrawnUsd = Number(account?.totalWithdrawnUsd ?? 0n) / 1e6;

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="font-semibold text-theme-text-primary">Your Pado Balance</h3>
          <p className="text-xs text-theme-text-secondary mt-0.5">
            Funds deposited to Pado for Spot and Predict.
          </p>
        </div>
        <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded shrink-0">
          <span className="mr-1">●</span>Active
        </span>
      </div>

      {/* Total */}
      <div className="mb-5">
        <div className="text-3xl font-bold text-theme-text-primary">
          ${totalPadoUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-xs text-theme-text-muted mt-1">
          {tokens.length === 0
            ? 'No tokens deposited yet'
            : `Across ${tokens.length} ${tokens.length === 1 ? 'token' : 'tokens'}`}
        </div>
      </div>

      {/* Composition bar + legend (only if there is balance) */}
      {tokens.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-theme-text-muted mb-1.5">Composition</div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-theme-bg-tertiary">
            {tokens.map((t) => (
              <div
                key={t.symbol}
                className={t.barClass}
                style={{ width: `${t.pct}%` }}
                title={`${t.symbol} ${t.pct.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-2">
            {tokens.map((t) => (
              <div key={t.symbol} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${t.dotClass}`} />
                <span className="text-theme-text-secondary font-medium">{t.symbol}</span>
                <span className="text-theme-text-muted">{t.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 && (
        <div className="space-y-2 mb-5">
          {tokens.map((t) => (
            <div
              key={t.symbol}
              className="flex items-center justify-between py-2.5 px-3 bg-theme-bg-tertiary rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <TokenIcon symbol={t.symbol as TokenSymbol} size="md" gradient />
                <div className="min-w-0">
                  <div className="font-medium text-sm text-theme-text-primary">{t.symbol}</div>
                  <div className="text-xs text-theme-text-muted truncate">{t.name}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium text-theme-text-primary">
                  {t.symbol === 'NBTC'
                    ? t.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })
                    : t.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-theme-text-muted">
                  ${t.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          onClick={() => setShowDepositModal(true)}
          className="py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
        >
          + Deposit
        </button>
        <button
          onClick={() => setShowWithdrawModal(true)}
          disabled={!account?.nusdcBalance || account.nusdcBalance === 0n}
          className="py-2.5 bg-theme-bg-tertiary hover:bg-theme-bg-primary text-theme-text-primary font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          - Withdraw
        </button>
      </div>

      {/* Withdraw All from Pado (BM + MA combined) - opens confirm modal */}
      {hasAnyPadoBalance && (
        <button
          onClick={() => { setWithdrawAllError(null); setShowWithdrawAllConfirm(true); }}
          disabled={isWithdrawing}
          className="w-full py-2 text-sm text-theme-text-secondary hover:text-theme-text-primary border border-theme-border hover:border-pd2 rounded-lg transition-colors disabled:opacity-50 mb-4"
        >
          {isWithdrawing ? "Withdrawing..." : "Withdraw All from Pado"}
        </button>
      )}

      {/* Period-filtered activity */}
      <PadoActivityCard
        marginAccountId={account?.id ?? null}
        lifetimeDepositedUsd={lifetimeDepositedUsd}
        lifetimeWithdrawnUsd={lifetimeWithdrawnUsd}
      />

      {/* Deposit Modal - tabbed (NUSDC | NBTC | NETH | NSOL) */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-theme-text-primary mb-4">Deposit</h3>

            {/* Token Tabs */}
            <div className="flex gap-1 mb-4 border-b border-theme-border">
              {DEPOSIT_TABS.map((tab) => {
                const balance = tokenBalanceRaw[tab];
                const disabled = balance === 0n;
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      if (disabled) return;
                      setActiveTab(tab);
                      setDepositAmount("");
                      setError(null);
                      setShowGasWarning(false);
                      setSlippageBps(50);
                      setCustomSlippage("");
                    }}
                    disabled={disabled}
                    title={disabled ? "No balance" : undefined}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === tab
                        ? 'border-pd2 text-theme-text-primary'
                        : disabled
                          ? 'border-transparent text-theme-text-muted cursor-not-allowed opacity-50'
                          : 'border-transparent text-theme-text-secondary hover:text-theme-text-primary'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-theme-text-secondary">Amount</span>
                <span className="text-theme-text-muted">
                  Wallet: {activeBalanceFloat.toLocaleString('en-US', { maximumFractionDigits: activeDecimals })} {activeTab}
                  {balanceUsd !== null && (
                    <span className="ml-1 text-theme-text-muted">≈ ${balanceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                  )}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    setShowGasWarning(false);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder:text-theme-text-muted"
                />
                <button
                  onClick={() => {
                    setDepositAmount(activeBalanceFloat.toString());
                    if (walletNasunAmount < MIN_GAS_RESERVE) setShowGasWarning(true);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-pd3 hover:text-pd3"
                >
                  MAX
                </button>
              </div>
              {amountUsd !== null && amountValid && (
                <div className="text-xs text-theme-text-muted mt-1">
                  ≈ ${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
              )}
            </div>

            {/* Quote Panel - NETH/NSOL only */}
            {isSwapTab && amountValid && (
              <div className="mb-4 p-3 bg-theme-bg-primary border border-theme-border rounded-lg space-y-2">
                {quoteError && (
                  <p className="text-xs text-red-400">Failed to fetch quote: {formatErrorMessage(quoteError)}</p>
                )}
                {!quote && !quoteError && debouncedAmountRaw > 0n && (
                  <p className="text-xs text-theme-text-muted">Fetching quote…</p>
                )}
                {quote && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-theme-text-secondary">You'll receive</span>
                      <span className="text-theme-text-primary font-medium">
                        ~{(Number(quote.expectedQuoteRaw) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
                        {expectedUsd !== null && (
                          <span className="ml-1 text-theme-text-muted text-xs">≈ ${expectedUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-theme-text-muted">Rate</span>
                      <span className="text-theme-text-secondary">1 {activeTab} = {quote.bestBidPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-theme-text-muted">Price impact</span>
                      <span
                        className={
                          quote.priceImpact < 0.001
                            ? 'text-theme-text-secondary'
                            : quote.priceImpact < 0.01
                              ? 'text-yellow-500'
                              : 'text-red-500 font-semibold'
                        }
                      >
                        {(quote.priceImpact * 100).toFixed(3)}%
                        {quote.priceImpact >= 0.01 && ' ⚠ high'}
                      </span>
                    </div>
                    {/* Slippage selector */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-theme-text-muted">Slippage</span>
                      <div className="flex gap-1">
                        {SLIPPAGE_PRESETS.map((bps) => (
                          <button
                            key={bps}
                            onClick={() => { setSlippageBps(bps); setCustomSlippage(""); }}
                            className={`px-2 py-1 rounded text-xs ${
                              slippageBps === bps && !customSlippage
                                ? 'bg-pd2 text-white'
                                : 'bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary'
                            }`}
                          >
                            {bps / 100}%
                            {bps === recommendedSlippageBps(quote) && (
                              <span className="ml-1 text-[10px] opacity-70">rec.</span>
                            )}
                          </button>
                        ))}
                        <input
                          type="number"
                          step="0.1"
                          min="0.05"
                          max="10"
                          placeholder="custom"
                          value={customSlippage}
                          onChange={(e) => {
                            setCustomSlippage(e.target.value);
                            const pct = parseFloat(e.target.value);
                            if (!isNaN(pct) && pct > 0 && pct < 100) {
                              setSlippageBps(Math.round(pct * 100));
                            }
                          }}
                          className="w-16 px-2 py-1 bg-theme-bg-tertiary border border-theme-border rounded text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-theme-border">
                      <span className="text-theme-text-muted">Min received</span>
                      <span className="text-theme-text-secondary">
                        {(minReceivedFloat ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
                      </span>
                    </div>
                    {quote.underestimateRisk && (
                      <p className="text-xs text-yellow-500">
                        ⚠ Order size exceeds best-bid depth; actual fill may be lower than quoted.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Gas Warning - only for NUSDC MAX (existing logic) */}
            {showGasWarning && (
              <div className="mb-4 p-3 bg-yellow-500/25 border border-yellow-500/50 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-500 text-sm">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      Low NSN balance ({walletNasunAmount.toFixed(3)} NSN). Keep at least{" "}
                      {MIN_GAS_RESERVE} NSN for transaction fees.
                    </p>
                    <p className="text-xs text-theme-text-muted mt-1">
                      Get NSN from faucet on the Trade page.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-500 mb-4">{error}</div>}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDepositModal(false);
                  resetDepositState();
                }}
                className="flex-1 py-2 bg-theme-bg-tertiary text-theme-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={isDepositing || (isSwapTab && !quote)}
                className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isDepositing ? "Depositing..." : "Confirm Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw All Confirmation Modal */}
      {showWithdrawAllConfirm && (
        <WithdrawAllConfirmModal
          bmNusdcRaw={padoAccount.breakdown.bm.quoteRaw}
          bmNbtcRaw={padoAccount.breakdown.bm.baseRaw}
          maNusdcRaw={padoAccount.breakdown.ma.nusdcRaw}
          isLoading={isWithdrawing}
          error={withdrawAllError}
          onConfirm={async () => {
            const result = await handleWithdrawAllPado();
            if (result.success) setShowWithdrawAllConfirm(false);
          }}
          onCancel={() => setShowWithdrawAllConfirm(false)}
        />
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-theme-text-primary mb-4">Withdraw NUSDC</h3>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-theme-text-secondary">Amount</span>
                <span className="text-theme-text-muted">
                  Margin Account: {formatNusdc(account?.nusdcBalance)} NUSDC
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder:text-theme-text-muted"
                />
                <button
                  onClick={() =>
                    setWithdrawAmount((Number(account?.nusdcBalance || 0n) / 1e6).toString())
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-pd3 hover:text-pd3"
                >
                  MAX
                </button>
              </div>
            </div>

            {error && <div className="text-sm text-red-500 mb-4">{error}</div>}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setError(null);
                }}
                className="flex-1 py-2 bg-theme-bg-tertiary text-theme-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawing}
                className="flex-1 py-2 bg-pd2 hover:bg-pd1 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isWithdrawing ? "Withdrawing..." : "Confirm Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
