/**
 * AirdropRegistrationCard
 *
 * Full-width bar card for April 16th Airdrop registration.
 * Shows registration status and Apply button.
 */

import { FC } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox, Spinner } from "@/components/ui";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useAirdropRegistration } from "./hooks/useAirdropRegistration";

interface AirdropRegistrationCardProps {
  className?: string;
}

const STATUS_CONFIG = {
  not_applied: { label: "Not applied", color: "text-nasun-white/50" },
  pending: { label: "Pending", color: "text-yellow-400" },
  approved: { label: "Approved", color: "text-green-400" },
} as const;

export const AirdropRegistrationCard: FC<AirdropRegistrationCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const { status, isLoading, isRegistering, error, register } = useAirdropRegistration(cognitoToken);

  const statusConfig = STATUS_CONFIG[status];

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      <div className="flex flex-col gap-2">
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
              onClick={register}
            >
              {isRegistering ? "Applying..." : status === "pending" ? "Applied" : "Apply"}
            </ButtonV3>
          )}
        </div>

        {/* Bottom row: approval status */}
        {user && !isLoading && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-nasun-white/50">Approval Status:</span>
            <span className={statusConfig.color}>{statusConfig.label}</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}
      </div>
    </OuterBox>
  );
};
