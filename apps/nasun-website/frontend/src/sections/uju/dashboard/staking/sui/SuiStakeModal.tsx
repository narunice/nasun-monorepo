import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSigner } from "@nasun/wallet";
import { UjuButton, UjuBadge } from "../../../shared";
import {
  useSuiTestnetValidators,
  useSuiTestnetStakes,
  useSuiTestnetBalance,
} from "./useSuiTestnetStaking";
import { useSuiTestnetStakeTransaction } from "./useSuiTestnetStakeTransaction";
import {
  formatSui,
  parseSuiAmount,
  shortValidator,
  MIN_STAKE_MIST,
  MIN_STAKE_SUI,
  SUI_TESTNET_FAUCET_URL,
  SUI_TESTNET_EXPLORER_TX,
  type SuiValidator,
  type SuiStake,
} from "./suiTestnet";

type Step = "overview" | "select" | "amount" | "result";

interface SuiStakeModalProps {
  open: boolean;
  onClose: () => void;
}

export function SuiStakeModal({ open, onClose }: SuiStakeModalProps) {
  const { address, isConnected, signerType, hasSigner, switchSigner } = useSigner();
  const isZkLogin = signerType === "zklogin";
  const canSwitchToLocal = isZkLogin && hasSigner("local");
  const canSwitchToPasskey = isZkLogin && hasSigner("passkey");

  const [step, setStep] = useState<Step>("overview");
  const [selected, setSelected] = useState<SuiValidator | null>(null);
  const [amount, setAmount] = useState("");
  const [pendingUnstakeId, setPendingUnstakeId] = useState<string | null>(null);

  const { data: validators, isLoading: vLoading } = useSuiTestnetValidators();
  const { data: stakes, isLoading: sLoading } = useSuiTestnetStakes(address);
  const { data: balance } = useSuiTestnetBalance(address);
  const { stake, unstake, status, error, lastResult, reset } =
    useSuiTestnetStakeTransaction();

  const validatorByAddr = useMemo(() => {
    const m = new Map<string, SuiValidator>();
    for (const v of validators ?? []) m.set(v.address, v);
    return m;
  }, [validators]);

  const handleClose = () => {
    setStep("overview");
    setSelected(null);
    setAmount("");
    setPendingUnstakeId(null);
    reset();
    onClose();
  };

  const handleStake = async () => {
    if (!selected) return;
    const mist = parseSuiAmount(amount);
    if (mist < MIN_STAKE_MIST) return;
    try {
      await stake(selected.address, mist);
    } catch {
      /* surfaced via error state */
    } finally {
      setStep("result");
    }
  };

  const handleUnstake = async (stakedSuiId: string) => {
    setPendingUnstakeId(stakedSuiId);
    try {
      await unstake(stakedSuiId);
    } catch {
      /* surfaced via error state */
    } finally {
      setStep("result");
      setPendingUnstakeId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="dark bg-uju-card border-uju-border overflow-y-auto max-h-[85vh] p-5 sm:p-6">
        <DialogTitle className="!text-white text-lg sm:text-xl font-semibold mb-4">
          SUI Staking <span className="text-uju-secondary text-base font-normal">· Testnet</span>
        </DialogTitle>

        {!isConnected ? (
          <NotConnected />
        ) : isZkLogin ? (
          <ZkLoginNotice
            canSwitchToLocal={canSwitchToLocal}
            canSwitchToPasskey={canSwitchToPasskey}
            onSwitchLocal={() => switchSigner("local")}
            onSwitchPasskey={() => switchSigner("passkey")}
            onClose={handleClose}
          />
        ) : step === "overview" ? (
          <Overview
            address={address!}
            balance={balance ?? 0n}
            stakes={stakes ?? []}
            validatorByAddr={validatorByAddr}
            isStakesLoading={sLoading}
            txPending={status === "pending"}
            pendingUnstakeId={pendingUnstakeId}
            onNewStake={() => setStep("select")}
            onUnstake={handleUnstake}
          />
        ) : step === "select" ? (
          <SelectValidator
            validators={validators ?? []}
            isLoading={vLoading}
            onPick={(v) => {
              setSelected(v);
              setStep("amount");
            }}
            onBack={() => setStep("overview")}
          />
        ) : step === "amount" ? (
          <EnterAmount
            validator={selected!}
            balance={balance ?? 0n}
            amount={amount}
            setAmount={setAmount}
            txPending={status === "pending"}
            onConfirm={handleStake}
            onBack={() => setStep("select")}
          />
        ) : (
          <Result
            status={status}
            error={error}
            digest={lastResult?.digest ?? ""}
            onDone={handleClose}
            onRetry={() => setStep("overview")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// -- Subviews ----------------------------------------------------------------

function NotConnected() {
  return (
    <div className="py-8 text-center">
      <p className="text-base text-uju-secondary">
        Connect your Nasun wallet first to stake on Sui Testnet.
      </p>
    </div>
  );
}

interface ZkLoginNoticeProps {
  canSwitchToLocal: boolean;
  canSwitchToPasskey: boolean;
  onSwitchLocal: () => void;
  onSwitchPasskey: () => void;
  onClose: () => void;
}

function ZkLoginNotice({
  canSwitchToLocal,
  canSwitchToPasskey,
  onSwitchLocal,
  onSwitchPasskey,
  onClose,
}: ZkLoginNoticeProps) {
  // zkLogin proofs are bound to a specific network's epoch counter. The proof
  // generated for Nasun Devnet is rejected by Sui Testnet because the testnet
  // epoch is far ahead, so the proof appears expired. A fresh OAuth sign-in
  // against Sui Testnet would be required to mint a valid proof there. For
  // now, route users to a mnemonic wallet or passkey signer.
  const canSwitch = canSwitchToLocal || canSwitchToPasskey;

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-base font-semibold text-amber-200 mb-1">
          zkLogin not supported here
        </p>
        <p className="text-sm text-uju-secondary leading-relaxed">
          Your Google/Twitter zkLogin proof is bound to Nasun Devnet's epoch and
          can't be validated on Sui Testnet. Use a Nasun mnemonic wallet or
          passkey to sign Sui Testnet transactions.
        </p>
      </div>

      {canSwitch ? (
        <div className="flex flex-col gap-2">
          {canSwitchToLocal && (
            <UjuButton fullWidth onClick={onSwitchLocal}>
              Switch to Mnemonic Wallet
            </UjuButton>
          )}
          {canSwitchToPasskey && (
            <UjuButton variant="secondary" fullWidth onClick={onSwitchPasskey}>
              Switch to Passkey
            </UjuButton>
          )}
        </div>
      ) : (
        <p className="text-sm text-uju-secondary text-center">
          No mnemonic or passkey wallet detected on this device.
        </p>
      )}

      <UjuButton variant="ghost" fullWidth onClick={onClose}>
        Close
      </UjuButton>
    </div>
  );
}

interface OverviewProps {
  address: string;
  balance: bigint;
  stakes: SuiStake[];
  validatorByAddr: Map<string, SuiValidator>;
  isStakesLoading: boolean;
  txPending: boolean;
  pendingUnstakeId: string | null;
  onNewStake: () => void;
  onUnstake: (stakedSuiId: string) => void;
}

function Overview({
  balance,
  stakes,
  validatorByAddr,
  isStakesLoading,
  txPending,
  pendingUnstakeId,
  onNewStake,
  onUnstake,
}: OverviewProps) {
  const totalStaked = stakes.reduce((acc, s) => acc + s.principal, 0n);
  const totalRewards = stakes.reduce(
    (acc, s) => acc + (s.estimatedReward ?? 0n),
    0n
  );

  return (
    <div className="space-y-5">
      {/* Balance + faucet */}
      <div className="rounded-xl bg-pado-2/10 border border-pado-2/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-uju-secondary">Available</p>
            <p className="text-xl font-semibold text-white tabular-nums">
              {formatSui(balance)} SUI
            </p>
          </div>
          {balance < MIN_STAKE_MIST && (
            <a
              href={SUI_TESTNET_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-medium text-pado-3 hover:text-pado-4 transition-colors"
            >
              Get test SUI ↗
            </a>
          )}
        </div>
      </div>

      {/* Existing stakes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-base font-semibold text-white">Your Stakes</h4>
          <span className="text-sm text-uju-secondary tabular-nums">
            {formatSui(totalStaked)} SUI
            {totalRewards > 0n ? ` +${formatSui(totalRewards)}` : ""}
          </span>
        </div>
        {isStakesLoading ? (
          <div className="py-6 text-center text-sm text-uju-secondary">Loading…</div>
        ) : stakes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-uju-border py-6 text-center text-sm text-uju-secondary">
            No active stakes yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {stakes.map((s) => {
              const v = validatorByAddr.get(s.validatorAddress);
              const isThisRowPending = pendingUnstakeId === s.stakedSuiId;
              return (
                <li
                  key={s.stakedSuiId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-uju-border bg-uju-bg/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-base font-medium text-white truncate">
                      {v ? shortValidator(v.name) : s.validatorAddress.slice(0, 10) + "…"}
                    </p>
                    <p className="text-sm text-uju-secondary tabular-nums">
                      {formatSui(s.principal)} SUI
                      {s.estimatedReward && s.estimatedReward > 0n
                        ? ` · +${formatSui(s.estimatedReward)} reward`
                        : ""}
                      {" · "}
                      <span
                        className={
                          s.status === "Active"
                            ? "text-pado-3"
                            : s.status === "Pending"
                            ? "text-amber-300"
                            : "text-uju-secondary"
                        }
                      >
                        {s.status}
                      </span>
                    </p>
                  </div>
                  <UjuButton
                    variant="secondary"
                    size="sm"
                    disabled={txPending || s.status !== "Active"}
                    onClick={() => onUnstake(s.stakedSuiId)}
                  >
                    {isThisRowPending ? "…" : "Unstake"}
                  </UjuButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <UjuButton fullWidth onClick={onNewStake} disabled={txPending}>
        New Stake
      </UjuButton>
    </div>
  );
}

interface SelectValidatorProps {
  validators: SuiValidator[];
  isLoading: boolean;
  onPick: (v: SuiValidator) => void;
  onBack: () => void;
}

function SelectValidator({ validators, isLoading, onPick, onBack }: SelectValidatorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">Select Validator</h4>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-uju-secondary hover:text-white"
        >
          ← Back
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-uju-secondary">Loading validators…</div>
      ) : validators.length === 0 ? (
        <div className="py-10 text-center text-sm text-uju-secondary">No validators available.</div>
      ) : (
        <ul className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {validators.map((v) => (
            <li key={v.address}>
              <button
                type="button"
                onClick={() => onPick(v)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-uju-border bg-uju-bg/40 hover:bg-uju-bg/70 hover:border-pado-3/40 transition-colors px-3 py-3 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {v.imageUrl ? (
                    <img
                      src={v.imageUrl}
                      alt=""
                      className="w-8 h-8 rounded-full border border-uju-border shrink-0"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-uju-border shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-base font-medium text-white truncate">
                      {shortValidator(v.name)}
                    </p>
                    <p className="text-sm text-uju-secondary tabular-nums">
                      Commission {(v.commissionRate * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
                <UjuBadge tone={v.apy > 0 ? "violet" : "neutral"}>
                  {v.apy > 0 ? `${(v.apy * 100).toFixed(2)}% APY` : "—"}
                </UjuBadge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface EnterAmountProps {
  validator: SuiValidator;
  balance: bigint;
  amount: string;
  setAmount: (v: string) => void;
  txPending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

function EnterAmount({
  validator,
  balance,
  amount,
  setAmount,
  txPending,
  onConfirm,
  onBack,
}: EnterAmountProps) {
  const mist = parseSuiAmount(amount);
  const tooSmall = amount !== "" && mist < MIN_STAKE_MIST;
  const tooLarge = mist > balance;
  const canConfirm = !tooSmall && !tooLarge && mist >= MIN_STAKE_MIST;

  // Reserve a small gas buffer when offering "Max".
  const gasBuffer = BigInt(50_000_000); // 0.05 SUI
  const maxStakable = balance > gasBuffer ? balance - gasBuffer : 0n;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-white">Enter Amount</h4>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-uju-secondary hover:text-white"
          disabled={txPending}
        >
          ← Back
        </button>
      </div>

      {/* Selected validator pill */}
      <div className="flex items-center gap-3 rounded-xl border border-uju-border bg-uju-bg/40 px-3 py-2.5">
        {validator.imageUrl ? (
          <img
            src={validator.imageUrl}
            alt=""
            className="w-8 h-8 rounded-full border border-uju-border"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-uju-border" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-white truncate">{shortValidator(validator.name)}</p>
          <p className="text-sm text-uju-secondary tabular-nums">
            {(validator.apy * 100).toFixed(2)}% APY · Commission {(validator.commissionRate * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="sui-stake-amount" className="text-sm text-uju-secondary">
            Amount (min {MIN_STAKE_SUI} SUI)
          </label>
          <button
            type="button"
            onClick={() => setAmount(formatSui(maxStakable))}
            className="text-sm text-pado-3 hover:text-pado-4 disabled:opacity-50"
            disabled={txPending || maxStakable < MIN_STAKE_MIST}
          >
            Max {formatSui(maxStakable)}
          </button>
        </div>
        <div className="flex items-stretch rounded-xl border border-uju-border bg-uju-bg overflow-hidden focus-within:border-pado-3">
          <input
            id="sui-stake-amount"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={txPending}
            className="flex-1 bg-transparent px-3 py-2 text-base text-white placeholder:text-uju-secondary focus:outline-none tabular-nums"
          />
          <span className="self-center px-3 text-sm text-uju-secondary">SUI</span>
        </div>
        {tooSmall && (
          <p className="mt-1.5 text-sm text-rose-400">Minimum stake is {MIN_STAKE_SUI} SUI.</p>
        )}
        {tooLarge && (
          <p className="mt-1.5 text-sm text-rose-400">Exceeds available balance.</p>
        )}
      </div>

      <UjuButton fullWidth onClick={onConfirm} disabled={!canConfirm || txPending}>
        {txPending ? "Submitting…" : "Stake"}
      </UjuButton>
    </div>
  );
}

interface ResultProps {
  status: "idle" | "pending" | "success" | "failure";
  error: string | null;
  digest: string;
  onDone: () => void;
  onRetry: () => void;
}

function Result({ status, error, digest, onDone, onRetry }: ResultProps) {
  const ok = status === "success";
  return (
    <div className="space-y-4 py-2">
      {status === "pending" ? (
        <p className="text-base text-uju-secondary text-center py-4">Submitting transaction…</p>
      ) : (
        <>
          <p className={`text-lg font-semibold text-center ${ok ? "text-pado-3" : "text-rose-400"}`}>
            {ok ? "Transaction submitted" : "Transaction failed"}
          </p>
          {ok && digest && (
            <a
              href={`${SUI_TESTNET_EXPLORER_TX}/${digest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-pado-3 hover:text-pado-4 break-all"
            >
              {digest.slice(0, 12)}… ↗
            </a>
          )}
          {!ok && error && (
            <p className="text-sm text-rose-300 text-center break-words">{error}</p>
          )}
          <div className="flex gap-2">
            {!ok && (
              <UjuButton variant="secondary" fullWidth onClick={onRetry}>
                Try again
              </UjuButton>
            )}
            <UjuButton fullWidth onClick={onDone}>
              Done
            </UjuButton>
          </div>
        </>
      )}
    </div>
  );
}
