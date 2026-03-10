/**
 * CompactNftStatus Component
 *
 * Battalion NFT Allowlist status in a compact layout.
 * For the Bento Grid dashboard.
 *
 * NOTE: Frontiers Whitelist is hidden during Battalion NFT campaign.
 * It will be re-added when Frontiers NFT campaign starts (post-Battalion sales).
 */

import { FC } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";

interface CompactNftStatusProps {
  className?: string;
}

const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const CompactNftStatus: FC<CompactNftStatusProps> = ({ className = "" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Battalion NFT Status — lookup by X account (twitterId)
  const twitterId = user?.twitterId ?? user?.linkedAccounts?.twitter?.twitterId;
  const effectiveXUserId = twitterId;
  const {
    isRegistered: isBattalionRegistered,
    isLoading: isBattalionLoading,
    status: battalionStatus,
  } = useBattalionNftStatus(undefined, effectiveXUserId);

  if (!effectiveXUserId) {
    return (
      <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">STATUS</h5>
        <p className="text-nasun-white/50">Link your X account to join the leaderboard</p>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <h5 className="font-medium uppercase text-nasun-white mb-4">STATUS</h5>
      <div className="flex flex-col gap-3">
        {/* Leaderboard Event CTA */}
        <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
          <h6 className="text-nasun-white">Leaderboard Event</h6>
          <p className="text-nasun-white/70 text-sm">
            You're in! Share content about Nasun and get recognized.
          </p>
          <Button onClick={() => navigate("/wave1/leaderboard-guide")} variant="filledOutlineC7" size="sm" className="self-end mt-1">
            Learn More
          </Button>
        </div>

        <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
          <h6 className="text-nasun-white">Battalion NFT Allowlist</h6>
          <div className="flex items-center justify-between">
            {isBattalionLoading ? (
              <Spinner size="sm" />
            ) : isBattalionRegistered ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-green-400 text-sm">&#10003; Registered</span>
                {battalionStatus?.walletAddress && (
                  <span className="text-nasun-white/50 text-xs font-mono">
                    {shortenAddress(battalionStatus.walletAddress)}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-nasun-white/50 text-sm">Not Registered</span>
            )}
            {!isBattalionLoading && !isBattalionRegistered && (
              <Button onClick={() => navigate("/wave1/battalion-nft")} variant="filledOutlineC7" size="sm">
                Join
              </Button>
            )}
          </div>
        </div>
      </div>
    </OuterBox>
  );
};

export default CompactNftStatus;
