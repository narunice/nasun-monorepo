/**
 * AirdropRegistrationCard
 *
 * Bar card for April 16th Airdrop registration.
 * Shows registration status and Apply button.
 * Supports `bare` mode for embedding inside ProfileHeroCard.
 */

import { FC, useState, useCallback } from "react";
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
import { GiParachute } from "react-icons/gi";
import { useAirdropRegistration } from "./hooks/useAirdropRegistration";

interface AirdropRegistrationCardProps {
  className?: string;
  /** When true, renders with dashed border instead of OuterBox (for embedding inside another card). */
  bare?: boolean;
}

const STATUS_CONFIG = {
  not_applied: { label: "Not registered", color: "text-nasun-white/30" },
  pending: { label: "Pending", color: "text-yellow-400" },
  approved: { label: "Registered", color: "text-emerald-400" },
  rejected: { label: "Rejected", color: "text-red-400" },
} as const;

export const AirdropRegistrationCard: FC<AirdropRegistrationCardProps> = ({
  className = "",
  bare = false,
}) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const { status, isLoading, isRegistering, error, register } =
    useAirdropRegistration(cognitoToken);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleConfirmedRegister = useCallback(async () => {
    setShowConfirm(false);
    await register();
    setShowSuccess(true);
  }, [register]);

  const statusConfig = STATUS_CONFIG[status];

  const content = (
    <div className="flex flex-col gap-0.5">
      {/* Top row: title + button */}
      <div className="flex items-center justify-between gap-4">
        <h5 className="font-medium text-nasun-white text-sm md:text-base">
          Register for April 16th Airdrop
        </h5>

        {!user ? (
          <span className="text-nasun-white/40 text-xs whitespace-nowrap">
            Sign in to register
          </span>
        ) : isLoading ? (
          <Spinner />
        ) : status === "approved" ? null : (
          <ButtonV3
            variant="nw2"
            size="sm"
            disabled={status === "pending" || isRegistering}
            onClick={() => setShowConfirm(true)}
          >
            {isRegistering
              ? "Registering..."
              : status === "pending"
                ? "Registered"
                : "Register"}
          </ButtonV3>
        )}
      </div>

      {/* Bottom row: status */}
      {user && !isLoading && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-nasun-white/40">Status:</span>
          <span className={statusConfig.color}>{statusConfig.label}</span>
        </div>
      )}

      {/* Genesis Pass highlight */}
      <div className="flex items-center justify-center gap-2 mt-2 bg-teal-100 rounded-md px-3 py-2">
        <GiParachute className="text-teal-700 text-lg md:text-xl shrink-0" />
        <h6 className="font-normal text-black">
          <span className="font-semibold">90%</span> of Airdrop Points go to{" "}
          <span className="font-semibold">Genesis Pass</span> holders.
        </h6>
      </div>

      {/* Error message */}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Step 1: Confirm Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm text-center !bg-slate-800">
          <DialogHeader className="items-center">
            <DialogTitle>Airdrop Registration</DialogTitle>
            <DialogDescription className="text-nasun-white/70 pt-2">
              Register for the April 16th Airdrop?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-3 mt-2">
            <ButtonV3
              variant="nw2"
              size="sm"
              onClick={handleConfirmedRegister}
              disabled={isRegistering}
            >
              {isRegistering ? "Registering..." : "Register"}
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

      {/* Step 2: Success Modal */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-sm text-center !bg-slate-800">
          <DialogHeader className="items-center">
            <DialogTitle>Registration Complete</DialogTitle>
            <DialogDescription className="text-nasun-white/70 pt-2">
              Successfully registered. Status will be updated.
            </DialogDescription>
          </DialogHeader>
          <ButtonV3
            variant="nw2"
            size="sm"
            onClick={() => setShowSuccess(false)}
            className="mt-2"
          >
            Close
          </ButtonV3>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (bare) {
    return (
      <div
        className={`border border-teal-400/60 bg-teal-900/30 rounded-lg p-4 ${className}`}
      >
        {content}
      </div>
    );
  }

  return (
    <OuterBox
      color="c5"
      padding="sm"
      className={`!border-teal-400/60 !bg-teal-900/30 ${className}`}
    >
      {content}
    </OuterBox>
  );
};
