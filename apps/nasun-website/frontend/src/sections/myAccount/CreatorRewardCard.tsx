/**
 * CreatorRewardCard
 *
 * One-time $3 USDC reward preference for SEASON1 top-100 creators.
 * Visible only to eligible users. Submission is immutable.
 */

import { FC, useState } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox, Spinner } from "@/components/ui";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCreatorReward } from "./hooks/useCreatorReward";
import type {
  RewardType,
  RewardChain,
} from "@/features/leaderboard-v3/services/creatorRewardApi";

interface CreatorRewardCardProps {
  className?: string;
}

const CHAIN_LABEL: Record<RewardChain, string> = {
  polygon: "Polygon",
  bnb: "BNB Chain",
};

const REWARD_TYPE_LABEL: Record<RewardType, string> = {
  polygon: "Polygon (MATIC)",
  bnb: "BNB Chain",
  binance: "Binance (UID)",
  custom: "Custom address",
};

export const CreatorRewardCard: FC<CreatorRewardCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const {
    status,
    isLoading,
    isError,
    isSubmitting,
    submitError,
    submit,
    refetch,
  } = useCreatorReward(cognitoToken);

  const [selected, setSelected] = useState<RewardType | null>(null);
  const [binanceUid, setBinanceUid] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customChain, setCustomChain] = useState<RewardChain>("polygon");
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const shouldRender =
    !!cognitoToken && (isLoading || isError || (!!status && status.eligible));
  if (!shouldRender) return null;

  const handleSubmitClick = () => {
    setValidationError(null);
    if (!selected) {
      setValidationError("Please select a reward option.");
      return;
    }
    if (selected === "binance") {
      if (!/^[1-9]\d{0,9}$/.test(binanceUid)) {
        setValidationError(
          "Enter a valid Binance UID (1-10 digits, no leading zero).",
        );
        return;
      }
    }
    if (selected === "custom") {
      if (!/^0x[0-9a-fA-F]{40}$/.test(customAddress)) {
        setValidationError("Enter a valid EVM address (0x + 40 hex chars).");
        return;
      }
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    const body =
      selected === "binance"
        ? { rewardType: selected as RewardType, binanceUid }
        : selected === "custom"
          ? {
              rewardType: selected as RewardType,
              destinationAddress: customAddress,
              destinationChain: customChain,
            }
          : { rewardType: selected! as RewardType };
    await submit(body);
  };

  if (isLoading) {
    return (
      <OuterBox
        color="w2"
        padding="md"
        className={`!border-amber-400/60 !bg-amber-900/20 ${className}`}
      >
        <div className="flex items-center gap-2 text-nasun-white/70 text-sm">
          <Spinner className="w-4 h-4" /> Loading reward info...
        </div>
      </OuterBox>
    );
  }

  if (isError) {
    return (
      <OuterBox
        color="w2"
        padding="md"
        className={`!border-amber-400/60 !bg-amber-900/20 ${className}`}
      >
        <div className="flex flex-col gap-3">
          <p className="text-red-400 text-sm">
            Failed to load reward status. Please try again.
          </p>
          <ButtonV3 variant="nw2" size="sm" onClick={() => refetch()}>
            Retry
          </ButtonV3>
        </div>
      </OuterBox>
    );
  }

  if (!status?.eligible) return null;

  // Already submitted - read-only view
  if (status.alreadySubmitted) {
    const submittedDetail =
      status.rewardType === "binance"
        ? `Binance UID: ${status.binanceUid ?? "-"}`
        : status.destinationAddressMasked
          ? `${CHAIN_LABEL[status.destinationChain ?? "polygon"]}: ${status.destinationAddressMasked}`
          : status.rewardType
            ? REWARD_TYPE_LABEL[status.rewardType]
            : "Submitted";

    return (
      <OuterBox
        color="w2"
        padding="md"
        className={`!border-amber-400/60 !bg-amber-900/20 ${className}`}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <h5 className="font-medium text-nasun-white text-sm md:text-base">
              Creator Reward - $3 USDC
            </h5>
            <p className="text-nasun-white/70 text-sm">
              Season 1 rank: #{status.rank}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm text-emerald-400 font-medium">
              Preference submitted
            </span>
            <span className="text-nasun-white/60 text-xs font-mono">
              {submittedDetail}
            </span>
          </div>
        </div>
      </OuterBox>
    );
  }

  const evmBlocked = (type: "polygon" | "bnb") =>
    type === selected && !status.evmAddressMasked;

  return (
    <OuterBox
      color="w2"
      padding="md"
      className={`!border-amber-400/60 !bg-amber-900/20 ${className}`}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h5 className="font-medium text-nasun-white text-sm md:text-base">
            Creator Reward - $3 USDC
          </h5>
          <p className="text-nasun-white/70 text-sm mt-1">
            This is a one-time reward for top-100 creators in the currently
            paused Season 1. Thank you for your contributions (rank #
            {status.rank}). Please choose how to receive your $3 USDC reward
            before April 25, 2026. If no option is selected, the reward will be
            sent via BNB Chain. Once chosen, your selection cannot be changed.
          </p>
        </div>

        {/* Radio options */}
        <div className="flex flex-col gap-2">
          {/* Polygon */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="rewardType"
              value="polygon"
              checked={selected === "polygon"}
              onChange={() => setSelected("polygon")}
              className="mt-0.5 accent-amber-400"
            />
            <div className="flex flex-col">
              <span className="text-nasun-white text-sm font-medium">
                Polygon (USDC)
              </span>
              {status.evmAddressMasked ? (
                <span className="text-nasun-white/60 text-xs">
                  Send to:{" "}
                  <span className="font-mono">{status.evmAddressMasked}</span>
                </span>
              ) : (
                <span className="text-amber-400 text-xs">
                  No EVM wallet connected. Connect MetaMask to use this option.
                </span>
              )}
            </div>
          </label>

          {/* BNB */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="rewardType"
              value="bnb"
              checked={selected === "bnb"}
              onChange={() => setSelected("bnb")}
              className="mt-0.5 accent-amber-400"
            />
            <div className="flex flex-col">
              <span className="text-nasun-white text-sm font-medium">
                BNB Chain (USDC)
              </span>
              {status.evmAddressMasked ? (
                <span className="text-nasun-white/60 text-xs">
                  Send to:{" "}
                  <span className="font-mono">{status.evmAddressMasked}</span>
                </span>
              ) : (
                <span className="text-amber-400 text-xs">
                  No EVM wallet connected. Connect MetaMask to use this option.
                </span>
              )}
            </div>
          </label>

          {/* Binance UID */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="rewardType"
              value="binance"
              checked={selected === "binance"}
              onChange={() => setSelected("binance")}
              className="mt-0.5 accent-amber-400"
            />
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-nasun-white text-sm font-medium">
                Binance (UID)
              </span>
              {selected === "binance" && (
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter your Binance UID"
                  value={binanceUid}
                  onChange={(e) =>
                    setBinanceUid(e.target.value.replace(/\D/g, ""))
                  }
                  maxLength={10}
                  className="mt-1 w-full max-w-xs bg-black/30 border border-nasun-white/20 rounded px-3 py-1.5 text-sm text-nasun-white placeholder:text-nasun-white/40 focus:outline-none focus:border-amber-400/60"
                />
              )}
            </div>
          </label>

          {/* Custom address */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="rewardType"
              value="custom"
              checked={selected === "custom"}
              onChange={() => setSelected("custom")}
              className="mt-0.5 accent-amber-400"
            />
            <div className="flex flex-col gap-2 flex-1">
              <span className="text-nasun-white text-sm font-medium">
                Custom address
              </span>
              {selected === "custom" && (
                <div className="flex flex-col gap-2 mt-1">
                  <input
                    type="text"
                    placeholder="0x... (EVM address)"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value.trim())}
                    className="w-full bg-black/30 border border-nasun-white/20 rounded px-3 py-1.5 text-sm text-nasun-white font-mono placeholder:text-nasun-white/40 focus:outline-none focus:border-amber-400/60"
                  />
                  <div className="flex gap-3">
                    {(["polygon", "bnb"] as RewardChain[]).map((chain) => (
                      <label
                        key={chain}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="customChain"
                          value={chain}
                          checked={customChain === chain}
                          onChange={() => setCustomChain(chain)}
                          className="accent-amber-400"
                        />
                        <span className="text-nasun-white/80 text-xs">
                          {CHAIN_LABEL[chain]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4 flex-wrap">
          <ButtonV3
            variant="nw2"
            size="sm"
            disabled={
              isSubmitting ||
              !selected ||
              evmBlocked("polygon") ||
              evmBlocked("bnb")
            }
            onClick={handleSubmitClick}
          >
            {isSubmitting && <Spinner className="w-3 h-3 mr-1" />}
            Submit Preference
          </ButtonV3>
          <p className="text-nasun-white/50 text-xs">
            This cannot be changed after submission.
          </p>
        </div>

        {(validationError || submitError) && (
          <p className="text-red-400 text-sm">
            {validationError || submitError}
          </p>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm text-center !bg-slate-800">
          <DialogHeader className="items-center">
            <DialogTitle>Confirm Reward Preference</DialogTitle>
            <DialogDescription className="text-nasun-white/70 pt-2">
              {selected === "binance"
                ? `Receive via Binance, UID: ${binanceUid}`
                : selected === "custom"
                  ? `Send to ${customAddress} on ${CHAIN_LABEL[customChain]}`
                  : selected
                    ? `Send to your connected wallet on ${CHAIN_LABEL[selected as RewardChain]}`
                    : ""}
              <br />
              <span className="text-amber-400 text-xs mt-1 inline-block">
                This preference cannot be changed after submission.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-3 mt-2">
            <ButtonV3
              variant="nw2"
              size="sm"
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Confirm"}
            </ButtonV3>
            <ButtonV3
              variant="nw2"
              size="sm"
              outline
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </ButtonV3>
          </div>
        </DialogContent>
      </Dialog>
    </OuterBox>
  );
};
