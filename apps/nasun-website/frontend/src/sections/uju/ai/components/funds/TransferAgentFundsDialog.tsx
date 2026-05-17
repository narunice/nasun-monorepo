import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/lib/sui-client';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import type { BudgetInfo } from '../../hooks/useBudgets';
import type { AgentTokenBalance } from '../../hooks/useAgentWalletBalances';
import { TOKENS, type TokenSymbol } from '../../services/network';
import { getCoinsByType, getNusdcCoins } from '../../services/coinService';
import {
  buildDepositToAgentWalletTransaction,
  buildDepositToBudgetTransaction,
} from '../../services/transactionBuilder';
import { isGasInsufficientError } from '../../services/txErrors';
import { executeTradingWithdraw, computeNasunMaxWithdraw } from '../../services/agentWithdrawTx';
import { truncateAddress } from '../../utils/format';

type TxStep = 'idle' | 'signing' | 'executing' | 'done' | 'error';

export type TransferMode = 'deposit' | 'withdraw-trading' | 'top-up-inference';

interface TransferAgentFundsDialogProps {
  agent: AgentProfile;
  walletAddress: string;
  mode: TransferMode;
  agentBalances: AgentTokenBalance[];
  activeBudgets: BudgetInfo[];
  onClose: () => void;
  onSuccess: () => void;
}

const AGENT_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

function parseRawAmount(display: string, decimals: number): bigint {
  const trimmed = display.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return 0n;
  const [whole = '0', frac = ''] = trimmed.split('.');
  const paddedFrac = (frac + '0'.repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(paddedFrac);
  } catch {
    return 0n;
  }
}

function formatRawAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

const inputBase =
  'w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2 transition-colors';

export function TransferAgentFundsDialog({
  agent,
  walletAddress,
  mode,
  agentBalances,
  activeBudgets,
  onClose,
  onSuccess,
}: TransferAgentFundsDialogProps) {
  const { signer, address } = useSigner();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [selectedCoin, setSelectedCoin] = useState<TokenSymbol>('NUSDC');
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(activeBudgets[0]?.id ?? '');
  const [passphrase, setPassphrase] = useState('');
  const [step, setStep] = useState<TxStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Owner balances for max computation and gas check
  const ownerBalancesQuery = useQuery({
    queryKey: ['transferDialog', 'ownerBalances', walletAddress],
    queryFn: () => suiClient.getAllBalances({ owner: walletAddress }),
    staleTime: 10_000,
  });
  const ownerBalanceMap = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const b of ownerBalancesQuery.data ?? []) {
      m.set(b.coinType, BigInt(b.totalBalance));
    }
    return m;
  }, [ownerBalancesQuery.data]);

  const ownerNasunRaw = ownerBalanceMap.get(TOKENS.NASUN.type) ?? 0n;
  const ownerNusdcRaw = ownerBalanceMap.get(TOKENS.NUSDC.type) ?? 0n;
  const isLowOwnerGas = ownerNasunRaw < 10_000_000n;

  const agentNasunRaw =
    agentBalances.find((b) => b.symbol === 'NASUN')?.totalBalanceRaw ?? 0n;
  const agentHasGas = agentNasunRaw > 0n;

  const selectedMeta = TOKENS[selectedCoin];
  const agentSelectedRaw =
    agentBalances.find((b) => b.symbol === selectedCoin)?.totalBalanceRaw ?? 0n;

  const amountRaw = parseRawAmount(amount, selectedMeta.decimals);

  // For deposit, coin is always NUSDC
  const depositAmountRaw = parseRawAmount(amount, TOKENS.NUSDC.decimals);

  // Max for each mode
  const maxForMode: bigint = useMemo(() => {
    if (mode === 'deposit' || mode === 'top-up-inference') return ownerNusdcRaw;
    // withdraw-trading
    if (selectedCoin === 'NASUN') return computeNasunMaxWithdraw(agentNasunRaw);
    return agentSelectedRaw;
  }, [mode, selectedCoin, ownerNusdcRaw, agentNasunRaw, agentSelectedRaw]);

  const maxDecimals =
    mode === 'withdraw-trading' ? selectedMeta.decimals : TOKENS.NUSDC.decimals;

  const handleMax = () => {
    setAmount(formatRawAmount(maxForMode, maxDecimals));
  };

  const handleClose = useCallback(() => {
    setPassphrase('');
    setAmount('');
    setError(null);
    setStep('idle');
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const signAndExecuteOwner = useCallback(
    async (tx: ReturnType<typeof buildDepositToAgentWalletTransaction>) => {
      if (!signer || !address) throw new Error('Wallet not connected');
      tx.setSender(address);
      const txBytes = await tx.build({ client: suiClient });
      const { signature } = await signer.sign(txBytes);
      setStep('executing');
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true },
      });
      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error ?? 'Transaction failed');
      }
      return result.digest;
    },
    [signer, address],
  );

  const handleSubmit = async () => {
    if (inFlight.current) return;
    setError(null);

    if (!AGENT_ADDRESS_RE.test(agent.agentAddress)) {
      setError('Invalid agent address. Cannot proceed.');
      return;
    }

    inFlight.current = true;
    setStep('signing');

    try {
      if (mode === 'deposit') {
        if (depositAmountRaw <= 0n) {
          setError('Enter an amount greater than 0.');
          setStep('idle');
          return;
        }
        if (depositAmountRaw > ownerNusdcRaw) {
          setError('Amount exceeds your NUSDC balance.');
          setStep('idle');
          return;
        }
        const coins = await getCoinsByType(
          suiClient,
          walletAddress,
          TOKENS.NUSDC.type,
          depositAmountRaw,
        );
        if (coins.length === 0) {
          setError('No NUSDC coins found in your wallet.');
          setStep('idle');
          return;
        }
        const tx = buildDepositToAgentWalletTransaction({
          signerAddress: walletAddress,
          toAgentAddress: agent.agentAddress,
          coinType: TOKENS.NUSDC.type,
          amountRaw: depositAmountRaw,
          ownerCoins: coins,
        });
        await signAndExecuteOwner(tx);
        await queryClient.refetchQueries({
          queryKey: ['nasun-ai', 'agentWalletBalances', agent.agentAddress],
        });
      } else if (mode === 'top-up-inference') {
        if (depositAmountRaw <= 0n) {
          setError('Enter an amount greater than 0.');
          setStep('idle');
          return;
        }
        if (!selectedBudgetId) {
          setError('No active inference balance found for this agent.');
          setStep('idle');
          return;
        }
        if (depositAmountRaw > ownerNusdcRaw) {
          setError('Amount exceeds your NUSDC balance.');
          setStep('idle');
          return;
        }
        const rawNum = Number(depositAmountRaw);
        const coins = await getNusdcCoins(suiClient, walletAddress, rawNum);
        const tx = buildDepositToBudgetTransaction(selectedBudgetId, coins, rawNum);
        await signAndExecuteOwner(tx);
        await queryClient.invalidateQueries({ queryKey: ['nasun-ai', 'budgets', walletAddress] });
      } else {
        // withdraw-trading
        if (amountRaw <= 0n) {
          setError('Enter an amount greater than 0.');
          setStep('idle');
          return;
        }
        if (!passphrase) {
          setError('Enter the passphrase you set when creating this agent.');
          setStep('idle');
          return;
        }
        if (selectedCoin !== 'NASUN' && !agentHasGas) {
          setError(
            'Agent has no NASUN for gas. Deposit a small amount of NASUN first to recover other tokens.',
          );
          setStep('idle');
          return;
        }
        if (amountRaw > maxForMode) {
          setError(
            selectedCoin === 'NASUN'
              ? 'Amount would leave insufficient gas reserve. Use Max to see the maximum withdrawable amount.'
              : 'Amount exceeds agent balance.',
          );
          setStep('idle');
          return;
        }
        await executeTradingWithdraw({
          walletAddress,
          agentAddress: agent.agentAddress,
          agentId: agent.id,
          passphrase,
          coinType: TOKENS[selectedCoin].type,
          amountRaw,
        });
        setPassphrase('');
        await queryClient.refetchQueries({
          queryKey: ['nasun-ai', 'agentWalletBalances', agent.agentAddress],
        });
      }

      setStep('done');
      setTimeout(onSuccess, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (mode === 'withdraw-trading' && (msg.includes('Decryption') || msg.includes('passphrase') || msg.includes('does not match'))) {
        setError('Wrong passphrase. Try the one you set when creating this agent.');
      } else if (isGasInsufficientError(err)) {
        setError('Not enough NASUN for gas. Use the in-wallet faucet to claim NASUN.');
      } else {
        setError(msg);
      }
      setStep('error');
    } finally {
      inFlight.current = false;
    }
  };

  const busy = step === 'signing' || step === 'executing';

  const title =
    mode === 'deposit'
      ? 'Send NUSDC to agent\'s trading wallet'
      : mode === 'top-up-inference'
      ? 'Top up inference balance'
      : 'Withdraw from agent\'s trading wallet';

  const subtitle =
    mode === 'deposit'
      ? `Your wallet to ${truncateAddress(agent.agentAddress)}. The agent uses this balance to execute trades.`
      : mode === 'top-up-inference'
      ? 'Add NUSDC to cover this agent\'s AI executor fees.'
      : `${truncateAddress(agent.agentAddress)} to your wallet. Enter your agent passphrase to authorize.`;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-sm bg-uju-card rounded-xl border border-uju-border/60 shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-sm text-uju-secondary">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 text-uju-secondary/60 hover:text-white transition-colors mt-0.5"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Gas warnings */}
        {(mode === 'deposit' || mode === 'top-up-inference') && isLowOwnerGas && (
          <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
            Not enough NASUN for gas. Use the in-wallet faucet to claim NASUN.
          </div>
        )}
        {mode === 'withdraw-trading' && !agentHasGas && selectedCoin !== 'NASUN' && (
          <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
            Agent has no NASUN for gas. Deposit a small amount of NASUN first to recover other tokens.
          </div>
        )}

        <div className="space-y-3">
          {/* Budget select for top-up-inference */}
          {mode === 'top-up-inference' && activeBudgets.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm text-uju-secondary">Inference Balance</label>
              <select
                value={selectedBudgetId}
                onChange={(e) => setSelectedBudgetId(e.target.value)}
                className={inputBase}
                disabled={busy}
              >
                {activeBudgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {truncateAddress(b.id)} — {(b.balance / 1e6).toFixed(2)} NUSDC
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Coin select for withdraw-trading */}
          {mode === 'withdraw-trading' && (
            <div className="space-y-1.5">
              <label className="text-sm text-uju-secondary">Token</label>
              <select
                value={selectedCoin}
                onChange={(e) => setSelectedCoin(e.target.value as TokenSymbol)}
                className={inputBase}
                disabled={busy}
              >
                {(Object.keys(TOKENS) as TokenSymbol[]).map((sym) => {
                  const bal = agentBalances.find((b) => b.symbol === sym);
                  const raw = bal?.totalBalanceRaw ?? 0n;
                  const display = formatRawAmount(raw, TOKENS[sym].decimals);
                  return (
                    <option key={sym} value={sym}>
                      {sym} — {display}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Amount input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-uju-secondary">Amount</label>
              <button
                type="button"
                onClick={handleMax}
                disabled={busy || maxForMode === 0n}
                className="text-xs text-pado-2 hover:text-pado-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Max: {formatRawAmount(maxForMode, maxDecimals)}{' '}
                {mode === 'withdraw-trading' ? selectedCoin : 'NUSDC'}
              </button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className={inputBase}
            />
          </div>

          {/* Passphrase for withdraw-trading */}
          {mode === 'withdraw-trading' && (
            <div className="space-y-1.5">
              <label className="text-sm text-uju-secondary">Agent passphrase</label>
              <input
                type="password"
                placeholder="Passphrase you set when creating this agent"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={busy}
                className={inputBase}
                autoComplete="off"
              />
              <p className="text-xs text-uju-secondary/60">
                Passphrase is required to decrypt this agent's key. There is no recovery if lost.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 break-words">
            {error}
          </div>
        )}

        {step === 'done' && (
          <div className="px-3 py-2 text-sm rounded-lg bg-green-500/10 border border-green-500/30 text-green-300">
            Transaction confirmed.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              busy ||
              step === 'done' ||
              (mode !== 'withdraw-trading' && isLowOwnerGas) ||
              (mode === 'withdraw-trading' && !agentHasGas && selectedCoin !== 'NASUN')
            }
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-pado-2 text-black font-medium hover:bg-pado-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy
              ? step === 'signing'
                ? 'Signing...'
                : 'Executing...'
              : mode === 'deposit'
              ? 'Deposit'
              : mode === 'top-up-inference'
              ? 'Top up'
              : 'Withdraw'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
