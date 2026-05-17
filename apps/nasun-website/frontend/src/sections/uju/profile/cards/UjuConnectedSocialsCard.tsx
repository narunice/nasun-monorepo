/**
 * UjuConnectedSocialsCard
 *
 * Social-account half of the profile-tab split. Manages X / Google /
 * Telegram links against the active Nasun identity. Wallet management
 * lives in the sibling UjuConnectedWalletsCard.
 */

import { FC } from "react";
import { useAuth } from "@/features/auth";

import { UjuAccountItem } from "../internal/UjuAccountItem";
import {
  UjuLinkedBadge,
  UjuLoggedInBadge,
  UjuChannelMemberBadge,
} from "../internal/UjuStatusBadges";
import { useUjuAccountLinking } from "../../hooks/useUjuAccountLinking";
import { useUjuTelegramVerify } from "../../hooks/useUjuTelegramVerify";
import { UjuCard, UjuSectionHeader, UjuButton } from "../../shared";

interface UjuConnectedSocialsCardProps {
  className?: string;
}

export const UjuConnectedSocialsCard: FC<UjuConnectedSocialsCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const { isLinking, handleLinkGoogle, handleLinkTwitter, unlinkAccount } =
    useUjuAccountLinking({ user });
  const telegram = useUjuTelegramVerify({ user });

  if (!user) {
    return (
      <UjuCard className={className}>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-pado-2 border-t-transparent rounded-full animate-spin" />
        </div>
      </UjuCard>
    );
  }

  const isTwitterPrimary = user.provider === "Twitter";
  const isGooglePrimary = user.provider === "Google";

  const twitterData = isTwitterPrimary ? user : user.linkedAccounts?.twitter;
  const googleData = isGooglePrimary ? user : user.linkedAccounts?.google;

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Connected Social Accounts"
        subtitle="Social identities linked to your Nasun profile"
      />

      <div className="grid gap-3 sm:gap-4 mt-6">
        <UjuAccountItem
          provider="twitter"
          description="Required to join the Leaderboard"
          identifier={
            twitterData?.twitterHandle
              ? `@${twitterData.originalTwitterHandle || user.originalTwitterHandle || twitterData.twitterHandle}`
              : undefined
          }
          statusBadge={
            isTwitterPrimary ? (
              <UjuLoggedInBadge />
            ) : twitterData ? (
              <UjuLinkedBadge />
            ) : undefined
          }
          actions={[
            twitterData && !isTwitterPrimary ? (
              <UjuButton
                key="sync"
                size="xs"
                variant="secondary"
                onClick={() => {
                  if (
                    confirm(
                      "Update your profile from X? You'll be briefly redirected to X.",
                    )
                  ) {
                    handleLinkTwitter();
                  }
                }}
                disabled={isLinking}
              >
                Sync
              </UjuButton>
            ) : null,
            !twitterData ? (
              <UjuButton
                key="link"
                size="xs"
                variant="primary"
                onClick={handleLinkTwitter}
                disabled={isLinking}
              >
                Link
              </UjuButton>
            ) : !isTwitterPrimary ? (
              <UjuButton
                key="unlink"
                size="xs"
                variant="secondary"
                className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                onClick={() => unlinkAccount("Twitter")}
                disabled={isLinking}
              >
                Unlink
              </UjuButton>
            ) : null,
          ]}
        />

        <UjuAccountItem
          provider="google"
          description="Link to receive newsletters and updates"
          identifier={googleData?.email}
          statusBadge={
            isGooglePrimary ? (
              <UjuLoggedInBadge />
            ) : googleData ? (
              <UjuLinkedBadge />
            ) : undefined
          }
          actions={[
            !googleData ? (
              <UjuButton
                key="link"
                size="xs"
                variant="primary"
                onClick={handleLinkGoogle}
                disabled={isLinking}
              >
                Link
              </UjuButton>
            ) : !isGooglePrimary ? (
              <UjuButton
                key="unlink"
                size="xs"
                variant="secondary"
                className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                onClick={() => unlinkAccount("Google")}
                disabled={isLinking}
              >
                Unlink
              </UjuButton>
            ) : null,
          ]}
        />

        <UjuAccountItem
          provider="telegram"
          description={
            telegram.isVerified
              ? "Nasun channel membership verified"
              : "Join our channel first, then verify"
          }
          identifier={
            telegram.isLoading
              ? "Loading..."
              : telegram.isVerified
                ? telegram.telegramUsername
                  ? `@${telegram.telegramUsername}`
                  : "Verified"
                : "Not connected"
          }
          statusBadge={
            telegram.isVerified ? <UjuChannelMemberBadge /> : undefined
          }
          actions={[
            !telegram.isVerified && !telegram.isLoading ? (
              <UjuButton
                key="join"
                size="xs"
                variant="secondary"
                as="a"
                href="https://t.me/nasun_official"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join
              </UjuButton>
            ) : null,
            !telegram.isVerified && !telegram.isLoading ? (
              <UjuButton
                key="connect"
                size="xs"
                variant="primary"
                onClick={telegram.connect}
                disabled={telegram.isVerifying}
              >
                {telegram.isVerifying ? "Verifying..." : "Verify"}
              </UjuButton>
            ) : null,
            telegram.isVerified ? (
              <UjuButton
                key="disconnect"
                size="xs"
                variant="secondary"
                className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                onClick={telegram.disconnect}
                disabled={telegram.isDisconnecting}
              >
                {telegram.isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </UjuButton>
            ) : null,
          ]}
        />
      </div>
    </UjuCard>
  );
};

export default UjuConnectedSocialsCard;
