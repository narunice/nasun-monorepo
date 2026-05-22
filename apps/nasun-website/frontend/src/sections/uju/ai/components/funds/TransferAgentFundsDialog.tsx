import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/lib/sui-client';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import type { BudgetInfo } from '../../hooks/useBudgets';
import type { AgentTokenBalance } from '../../hooks/useAgentWalletBalances';
import { TOKENS, BUDGET_CONFIG, type TokenSymbol } from '../../services/network';
import { getCoinsByType, getNusdcCoins } from '../../services/coinService';
import {
  buildDepositToAgentWalletTransaction,
  buildDepositToAgentEscrowTransaction,
  buildWithdrawOwnerFromAgentEscrowTransaction,
  buildDepositToBudgetTransaction,
  buildWithdrawFromBudgetTransaction,
} from '../../services/transactionBuilder';
import { isGasInsufficientError } from '../../services/txErrors';
import { executeTradingWithdraw } from '../../services/agentWithdrawTx';
import { useCapability } from '../../hooks/useCapability';
import { useAgentEscrowBalances } from '../../hooks/useAgentEscrowBalances';
import { truncateAddress } from '../../utils/format';
import {
  parseRawAmount,
  formatRawAmount,
  computeMaxForMode,
  OWNER_NASUN_GAS_RESERVE_MIST,
  type TransferMode,
} from '../../utils/transferAmount';

type TxStep = 'idle' | 'signing' | 'executing' | 'done' | 'error';

export type { TransferMode };

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

  // Capability fetch resolves agent.capabilityId -> escrowId so trade-asset
  // deposits route into the on-chain AgentEscrow (the only path `withdraw_for_action`
  // sources from). NASUN deposits stay routed to the agent's owned wallet because
  // gas must live on the agent for it to sign PTBs at all.
  const capability = useCapability(agent.capabilityId);
  const escrowId = capability.data?.escrowId ?? null;
  // Escrow balances are the source of truth for trade assets. Used both for
  // the withdraw Max calculation (escrow only, legacy stuck wallet balance is
  // intentionally excluded) and to refetch after deposit/withdraw mutations.
  const escrowBalances = useAgentEscrowBalances(escrowId);

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
  // Use the same reserve threshold the NASUN-deposit Max formula relies on,
  // so the "low gas" warning fires before a user enters an amount that
  // would leave them unable to sponsor follow-up txs.
  const isLowOwnerGas = ownerNasunRaw < OWNER_NASUN_GAS_RESERVE_MIST;

  const agentNasunRaw =
    agentBalances.find((b) => b.symbol === 'NASUN')?.totalBalanceRaw ?? 0n;
  const agentHasGas = agentNasunRaw > 0n;

  // top-up-inference and withdraw-inference are locked to NUSDC (budget is
  // NUSDC-denominated). deposit + withdraw-trading use the selected token.
  const effectiveCoin: TokenSymbol =
    mode === 'top-up-inference' || mode === 'withdraw-inference' ? 'NUSDC' : selectedCoin;
  const effectiveMeta = TOKENS[effectiveCoin];
  const agentSelectedRaw =
    agentBalances.find((b) => b.symbol === effectiveCoin)?.totalBalanceRaw ?? 0n;
  const ownerSelectedRaw = ownerBalanceMap.get(effectiveMeta.type) ?? 0n;
  // Escrow balance of the selected coin (NSN escrow row will be 0n since
  // gas-only token never gets escrowed). Used for withdraw-trading Max.
  const agentEscrowSelectedRaw =
    escrowBalances.data?.find((b) => b.type === effectiveMeta.type)?.totalBalanceRaw ?? 0n;

  const amountRaw = parseRawAmount(amount, effectiveMeta.decimals);

  // Selected budget for inference top-up / withdraw. Source of truth for
  // withdraw-inference Max so the user sees exactly what's currently in the
  // budget object they're about to drain.
  const selectedBudget = useMemo(
    () => activeBudgets.find((b) => b.id === selectedBudgetId) ?? activeBudgets[0],
    [activeBudgets, selectedBudgetId],
  );
  const budgetBalanceRaw = selectedBudget ? BigInt(selectedBudget.balance) : 0n;

  const maxForMode: bigint = useMemo(
    () =>
      computeMaxForMode({
        mode,
        effectiveCoin,
        ownerSelectedRaw,
        ownerNusdcRaw,
        agentNasunRaw,
        agentSelectedRaw,
        agentEscrowSelectedRaw,
        budgetBalanceRaw,
      }),
    [mode, effectiveCoin, ownerNusdcRaw, ownerSelectedRaw, agentNasunRaw, agentSelectedRaw, agentEscrowSelectedRaw, budgetBalanceRaw],
  );

  const maxDecimals = effectiveMeta.decimals;

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
      // Without this, the immediate refetch after deposit/withdraw hits the
      // RPC before the fullnode has propagated the new balance, so the funds
      // card still shows the stale pre-tx number until the user reloads.
      // waitForTransaction blocks until the fullnode marks the tx finalized,
      // making the subsequent getBalance return the new state.
      await suiClient.waitForTransaction({ digest: result.digest });
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
        if (amountRaw <= 0n) {
          setError('Enter an amount greater than 0.');
          setStep('idle');
          return;
        }
        if (amountRaw > maxForMode) {
          setError(
            effectiveCoin === 'NASUN'
              ? `Amount would leave you with less than ${formatRawAmount(OWNER_NASUN_GAS_RESERVE_MIST, TOKENS.NASUN.decimals)} ${TOKENS.NASUN.symbol} for gas. Use Max to see the safe maximum.`
              : `Amount exceeds your ${effectiveMeta.symbol} balance.`,
          );
          setStep('idle');
          return;
        }
        const coins = await getCoinsByType(
          suiClient,
          walletAddress,
          effectiveMeta.type,
          amountRaw,
        );
        if (coins.length === 0) {
          setError(`No ${effectiveMeta.symbol} coins found in your wallet.`);
          setStep('idle');
          return;
        }
        // Token-type routing: NASUN funds the agent's gas wallet (PTB signer
        // pays gas from there). Every other token is trading capital and MUST
        // land in the AgentEscrow because `withdraw_for_action` only sources
        // from the escrow — coins sitting in the agent's owned wallet are
        // dead capital w.r.t. trade settlement (2026-05-19 incident: 1200
        // NUSDC in agent wallet, every trade aborted with E_ESCROW_NO_BALANCE).
        if (effectiveCoin === 'NASUN') {
          const tx = buildDepositToAgentWalletTransaction({
            signerAddress: walletAddress,
            toAgentAddress: agent.agentAddress,
            coinType: effectiveMeta.type,
            amountRaw,
            ownerCoins: coins,
          });
          await signAndExecuteOwner(tx);
        } else {
          // Capability fetch is async. If it hasn't resolved yet, do NOT show
          // the "no trading escrow linked" error — that message tells the user
          // to recreate the agent, which is wrong when capability is merely
          // still loading. Surface a transient hint and let them retry.
          if (capability.isLoading || (!capability.data && !capability.fetchError)) {
            setError('Loading trading escrow info... try again in a moment.');
            setStep('idle');
            return;
          }
          if (!escrowId) {
            setError(
              capability.fetchError
                ? `Could not load the trading escrow for this agent (${capability.fetchError}). Refresh and try again.`
                : 'This agent has no trading escrow linked. Was it created before escrow support? Recreate the agent to enable trading deposits.',
            );
            setStep('idle');
            return;
          }
          const tx = buildDepositToAgentEscrowTransaction({
            signerAddress: walletAddress,
            escrowId,
            coinType: effectiveMeta.type,
            amountRaw,
            ownerCoins: coins,
          });
          await signAndExecuteOwner(tx);
        }
        // Refetch BOTH wallet and escrow balances. Escrow is where NUSDC/NBTC
        // actually lands now; missing this refetch leaves the funds card
        // showing stale 0 for up to 60s, reintroducing the exact UX bug the
        // escrow display was added to solve.
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: ['nasun-ai', 'agentWalletBalances', agent.agentAddress],
          }),
          queryClient.refetchQueries({
            queryKey: ['nasun-ai', 'agentEscrowBalances', escrowId],
          }),
        ]);
      } else if (mode === 'withdraw-inference') {
        if (amountRaw <= 0n) {
          setError('Enter an amount greater than 0.');
          setStep('idle');
          return;
        }
        if (!selectedBudgetId) {
          setError('No active inference balance found for this agent.');
          setStep('idle');
          return;
        }
        if (amountRaw > budgetBalanceRaw) {
          setError('Amount exceeds inference balance.');
          setStep('idle');
          return;
        }
        // Owner-signed withdraw. Move asserts budget.owner == sender so the
        // owner wallet must sign; agent key is not involved. No min check
        // (only deposit enforces MIN_DEPOSIT).
        const tx = buildWithdrawFromBudgetTransaction(selectedBudgetId, Number(amountRaw));
        await signAndExecuteOwner(tx);
        await queryClient.invalidateQueries({ queryKey: ['nasun-ai', 'budgets', walletAddress] });
      } else if (mode === 'top-up-inference') {
        if (amountRaw <= 0n) {
          setError('Enter an amount greater than 0.');
          setStep('idle');
          return;
        }
        if (!selectedBudgetId) {
          setError('No active inference balance found for this agent.');
          setStep('idle');
          return;
        }
        // Move contract enforces MIN_DEPOSIT (0.1 NUSDC). Validate client-
        // side so the user gets an actionable error before signing.
        const minDeposit = BigInt(BUDGET_CONFIG.MIN_DEPOSIT);
        if (amountRaw < minDeposit) {
          const minDisplay = (BUDGET_CONFIG.MIN_DEPOSIT / 1e6).toFixed(2);
          setError(`Minimum top-up is ${minDisplay} NUSDC.`);
          setStep('idle');
          return;
        }
        if (amountRaw > ownerNusdcRaw) {
          setError('Amount exceeds your NUSDC balance.');
          setStep('idle');
          return;
        }
        const rawNum = Number(amountRaw);
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
        if (amountRaw > maxForMode) {
          setError(
            selectedCoin === 'NASUN'
              ? 'Amount would leave insufficient gas reserve. Use Max to see the maximum withdrawable amount.'
              : 'Amount exceeds escrow balance.',
          );
          setStep('idle');
          return;
        }
        // Trade assets (NUSDC/NBTC/...): pull from the on-chain AgentEscrow
        // via `escrow::withdraw_owner` (owner-signed, ignores cap state). No
        // passphrase needed — the owner wallet is the signer, so the agent
        // key is irrelevant for this path. NSN gas still uses the
        // agent-signed flow that requires the passphrase.
        if (selectedCoin === 'NASUN') {
          if (!passphrase) {
            setError('Enter the passphrase you set when creating this agent.');
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
        } else {
          if (capability.isLoading || (!capability.data && !capability.fetchError)) {
            setError('Loading trading escrow info... try again in a moment.');
            setStep('idle');
            return;
          }
          if (!escrowId) {
            setError(
              capability.fetchError
                ? `Could not load the trading escrow for this agent (${capability.fetchError}). Refresh and try again.`
                : 'This agent has no trading escrow linked. Was it created before escrow support?',
            );
            setStep('idle');
            return;
          }
          const tx = buildWithdrawOwnerFromAgentEscrowTransaction({
            signerAddress: walletAddress,
            escrowId,
            coinType: effectiveMeta.type,
            amountRaw,
          });
          await signAndExecuteOwner(tx);
        }
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: ['nasun-ai', 'agentWalletBalances', agent.agentAddress],
          }),
          queryClient.refetchQueries({
            queryKey: ['nasun-ai', 'agentEscrowBalances', escrowId],
          }),
        ]);
      }

      setStep('done');
      setTimeout(onSuccess, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // WebCrypto crypto.subtle.decrypt throws a DOMException with
      // name='OperationError' and a generic message that does not include
      // any of the substrings below, so name-check first before falling
      // back to message-substring matching.
      const isWebCryptoDecryptFailure =
        err instanceof Error && err.name === 'OperationError';
      if (
        mode === 'withdraw-trading' &&
        (isWebCryptoDecryptFailure ||
          msg.includes('Decryption') ||
          msg.includes('passphrase') ||
          msg.includes('does not match'))
      ) {
        setError('Wrong passphrase. Try the one you set when creating this agent.');
      } else if (isGasInsufficientError(err)) {
        setError('Not enough NSN for gas. Use the in-wallet faucet to claim NSN.');
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
      ? `Send ${effectiveMeta.symbol} to agent's trading wallet`
      : mode === 'top-up-inference'
      ? 'Top up inference balance'
      : mode === 'withdraw-inference'
      ? 'Withdraw inference balance'
      : 'Withdraw from agent\'s trading wallet';

  const subtitle =
    mode === 'deposit'
      ? `Your wallet to ${truncateAddress(agent.agentAddress)}. The agent uses this balance to execute trades${effectiveCoin === 'NASUN' ? ' and pay its own gas' : ''}.`

      : mode === 'top-up-inference'
      ? 'Add NUSDC to cover this agent\'s AI executor fees.'
      : mode === 'withdraw-inference'
      ? 'Withdraw remaining NUSDC from this agent\'s inference balance back to your wallet.'
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
        {(mode === 'deposit' || mode === 'top-up-inference' || mode === 'withdraw-inference') && isLowOwnerGas && (
          <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
            Not enough NSN for gas. Use the in-wallet faucet to claim NSN.
          </div>
        )}
        {mode === 'withdraw-trading' && !agentHasGas && selectedCoin !== 'NASUN' && (
          <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">
            Agent has no NSN for gas. Deposit a small amount of NSN first to recover other tokens.
          </div>
        )}
        {mode === 'withdraw-trading' && selectedCoin === 'NASUN' && agentHasGas && maxForMode === 0n && (
          <div className="px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            Agent NSN is below the gas reserve. Withdrawing now would leave nothing for trade gas. Deposit more NSN before withdrawing, or use another token.
          </div>
        )}

        <div className="space-y-3">
          {/* Budget select for top-up-inference and withdraw-inference */}
          {(mode === 'top-up-inference' || mode === 'withdraw-inference') && activeBudgets.length > 1 && (
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
                    {truncateAddress(b.id)} · {(b.balance / 1e6).toFixed(2)} NUSDC
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Coin select for deposit + withdraw-trading. top-up-inference is NUSDC-only. */}
          {(mode === 'deposit' || mode === 'withdraw-trading') && (
            <div className="space-y-1.5">
              <label className="text-sm text-uju-secondary">
                {mode === 'deposit'
                  ? 'Token to send (balances shown are from your wallet)'
                  : 'Token to withdraw (balances shown are agent\'s)'}
              </label>
              <select
                value={selectedCoin}
                onChange={(e) => setSelectedCoin(e.target.value as TokenSymbol)}
                className={inputBase}
                disabled={busy}
              >
                {(Object.keys(TOKENS) as TokenSymbol[]).map((sym) => {
                  const raw =
                    mode === 'deposit'
                      ? ownerBalanceMap.get(TOKENS[sym].type) ?? 0n
                      : agentBalances.find((b) => b.symbol === sym)?.totalBalanceRaw ?? 0n;
                  const display = formatRawAmount(raw, TOKENS[sym].decimals);
                  return (
                    <option key={sym} value={sym}>
                      {TOKENS[sym].symbol} · {display}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Amount input. Max shown as a prominent chip beside the input
              (the earlier text-link form was easy to miss). */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-uju-secondary">Amount</label>
              <span className="text-xs text-uju-secondary/70">
                Available: {formatRawAmount(maxForMode, maxDecimals)} {effectiveMeta.symbol}
              </span>
            </div>
            <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className={`${inputBase} pr-16`}
              // Chrome's built-in password manager kept autofilling "admin" into
              // this field on dialog open (2026-05-20 incident) even with
              // autocomplete="off" + named field + 1Password/LastPass ignore
              // attributes — Chrome ignores all of those heuristically. The
              // readOnly-then-release trick works because the password manager
              // only fills on page load, when the input is read-only and
              // therefore skipped; user click removes the attribute so typing
              // still works.
              readOnly
              onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
              autoComplete="one-time-code"
              name="transfer-amount"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            <button
              type="button"
              onClick={handleMax}
              disabled={busy || maxForMode === 0n}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs rounded-md bg-pado-2/15 border border-pado-2/40 text-pado-2 hover:bg-pado-2/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Max
            </button>
            </div>
          </div>

          {/* Passphrase only required for withdrawing NSN gas (agent-signed
              flow). Trade-asset withdraw goes through escrow::withdraw_owner
              which uses the owner wallet signature — no agent key needed. */}
          {mode === 'withdraw-trading' && selectedCoin === 'NASUN' && (
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
                Passphrase is required to decrypt this agent's key for NSN gas withdrawal. There is no recovery if lost.
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
              (mode === 'withdraw-trading' && !agentHasGas && selectedCoin !== 'NASUN') ||
              ((mode === 'withdraw-trading' || mode === 'withdraw-inference') && maxForMode === 0n)
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
