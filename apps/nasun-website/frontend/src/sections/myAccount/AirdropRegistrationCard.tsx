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

export const AirdropRegistrationCard: FC<AirdropRegistrationCardProps> = ({ className = "", bare = false }) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const { status, isLoading, isRegistering, error, register } = useAirdropRegistration(cognitoToken);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleRegister = useCallback(async () => {
    await register();
    if (!error) {
      setShowSuccess(true);
    }
  }, [register, error]);

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
            onClick={handleRegister}
          >
            {isRegistering ? "Registering..." : status === "pending" ? "Registered" : "Register"}
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

      {/* Error message */}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Success Modal */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader className="items-center">
            <DialogTitle>Registration Complete</DialogTitle>
            <DialogDescription className="text-nasun-white/70 pt-2">
              Successfully registered for April 16th Airdrop. Status will be updated.
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
      <div className={`border border-dashed border-nasun-white/10 rounded-lg p-4 ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      {content}
    </OuterBox>
  );
};
