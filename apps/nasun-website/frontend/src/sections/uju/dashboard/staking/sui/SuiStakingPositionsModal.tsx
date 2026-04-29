import { useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UjuButton } from "../../../shared";
import {
  useSuiTestnetValidators,
  useSuiTestnetStakes,
  useSuiTestnetBalance,
} from "./useSuiTestnetStaking";
import {
  formatSui,
  shortValidator,
  type SuiValidator,
} from "./suiTestnet";

const SUI_VALIDATORS_URL = "https://suiscan.xyz/mainnet/validators";
const SUI_STAKE_OBJECT_URL = "https://suiscan.xyz/mainnet/object";
const SUI_ADDRESS_URL = "https://suiscan.xyz/mainnet/account";

interface SuiStakingPositionsModalProps {
  open: boolean;
  onClose: () => void;
  /** SUI address to display positions for. Selector logic lives in StakingCard. */
  address: string;
}

/**
 * Read-only positions modal for Sui mainnet stakes.
 * No transaction signing — staking actions deep-link to suiscan/Sui Wallet.
 * Works equally for zkLogin / mnemonic / passkey users (no signature required).
 */
export function SuiStakingPositionsModal({
  open,
  onClose,
  address,
}: SuiStakingPositionsModalProps) {
  const { data: validators } = useSuiTestnetValidators();
  const { data: stakes, isLoading: stakesLoading } = useSuiTestnetStakes(address);
  const { data: balance } = useSuiTestnetBalance(address);

  const validatorByAddr = useMemo(() => {
    const m = new Map<string, SuiValidator>();
    for (const v of validators ?? []) m.set(v.address, v);
    return m;
  }, [validators]);

  const stakeList = stakes ?? [];
  const totalStaked = stakeList.reduce((acc, s) => acc + s.principal, 0n);
  const totalRewards = stakeList.reduce(
    (acc, s) => acc + (s.estimatedReward ?? 0n),
    0n,
  );

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="dark bg-uju-card border-uju-border overflow-y-auto max-h-[85vh] p-5 sm:p-6">
        <DialogTitle className="!text-white text-lg sm:text-xl font-semibold mb-1">
          SUI Staking <span className="text-uju-secondary text-base font-normal">· Mainnet</span>
        </DialogTitle>
        <p className="text-sm text-uju-secondary mb-4">
          Showing positions for{" "}
          <a
            href={`${SUI_ADDRESS_URL}/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pado-2 hover:text-pado-4"
          >
            {shortAddr} ↗
          </a>
        </p>

        <div className="space-y-5">
          {/* Balance + faucet */}
          <div className="rounded-xl bg-pado-2/10 border border-pado-2/30 p-4">
            <div>
              <p className="text-sm text-uju-secondary">Available</p>
              <p className="text-xl font-semibold text-white tabular-nums">
                {formatSui(balance ?? 0n)} SUI
              </p>
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
            {stakesLoading ? (
              <div className="py-6 text-center text-sm text-uju-secondary">Loading…</div>
            ) : stakeList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-uju-border py-6 text-center text-sm text-uju-secondary">
                No active stakes yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {stakeList.map((s) => {
                  const v = validatorByAddr.get(s.validatorAddress);
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
                                ? "text-pado-2"
                                : s.status === "Pending"
                                ? "text-amber-300"
                                : "text-uju-secondary"
                            }
                          >
                            {s.status}
                          </span>
                        </p>
                      </div>
                      <a
                        href={`${SUI_STAKE_OBJECT_URL}/${s.stakedSuiId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-pado-2 hover:text-pado-4 shrink-0"
                      >
                        View ↗
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <UjuButton
            fullWidth
            onClick={() => window.open(SUI_VALIDATORS_URL, "_blank", "noopener,noreferrer")}
          >
            Manage on Sui ↗
          </UjuButton>
          <p className="text-sm text-uju-secondary text-center -mt-2">
            New stakes and unstaking are managed on suiscan or your Sui wallet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
