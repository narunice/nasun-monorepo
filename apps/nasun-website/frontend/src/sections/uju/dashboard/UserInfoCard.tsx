import { useMemo, useState, useEffect } from "react";
import Avatar from "boring-avatars";
import {
  resolveAvatarUrl,
  resolveDisplayName,
  type EcosystemProfile,
} from "@nasun/profile-react";
import { GenesisPassBadge, AllianceBadge } from "@nasun/wallet-ui";
import { useUserStore } from "@/store/userStore";
import { useMyProfile } from "@/features/profile/useMyProfile";
import { useAuth } from "@/features/auth";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { UjuCard } from "../shared";

const PUBLIC_AVATARS_BASE_URL =
  (import.meta.env.VITE_PUBLIC_AVATARS_BASE_URL as string | undefined) ?? "";

function ecosystemProfileFromUserStore(
  user: ReturnType<typeof useUserStore.getState>["user"],
): EcosystemProfile | null {
  if (!user) return null;
  return {
    identityId: user.identityId,
    walletAddress: user.walletAddress,
    customDisplayName: user.customDisplayName,
    customAvatarKey: user.customAvatarKey,
    customAvatarBanned: user.customAvatarBanned,
    provider: user.provider,
    username: user.username,
    email: user.email,
    twitterHandle: user.twitterHandle,
    originalTwitterHandle: user.originalTwitterHandle,
    linkedAccounts: user.linkedAccounts as EcosystemProfile["linkedAccounts"],
  };
}

interface UserInfoCardProps {
  /** Render only the body (no outer UjuCard) for use inside a combined card. */
  bare?: boolean;
}

export function UserInfoCard({ bare = false }: UserInfoCardProps = {}) {
  const user = useUserStore((s) => s.user);
  const { data: serverProfile } = useMyProfile();
  const { user: authUser } = useAuth();
  // GP badge source: the activation-status endpoint, same one HealthGaugeCard's
  // V1 fallback uses for the "Full Boost" donut. Reading from
  // useEcosystemScore().health.genesisPass.hasNft fails when the V2 cutover
  // env var isn't set on explorer-api (health is then null), which leaves
  // the badge stuck off even though the user has clearly activated GP.
  const { getActivation } = useEcosystemStatus(
    authUser?.cognitoToken,
    authUser?.identityId,
  );

  const profile: EcosystemProfile | null = useMemo(() => {
    if (serverProfile) return serverProfile;
    return ecosystemProfileFromUserStore(user);
  }, [serverProfile, user]);

  const { name: displayName } = useMemo(
    () => resolveDisplayName(profile),
    [profile],
  );
  const avatarUrl = useMemo(
    () => resolveAvatarUrl(profile, { baseUrl: PUBLIC_AVATARS_BASE_URL }),
    [profile],
  );

  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const hasAlliance = !!getActivation("alliance");
  const hasGenesisPass = !!getActivation("genesis-pass");

  // Joined-on label. Falls back gracefully if backend hasn't populated
  // createdAt yet (legacy users from before the field was wired).
  const joinedLabel = useMemo(() => {
    const ts = serverProfile?.createdAt;
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [serverProfile?.createdAt]);

  const body = (
    // Column layout:
    //   - Top spacer (mt-auto on the identity group via flex-1 wrapper)
    //   - NFT badges (Alliance on top, GP below) → avatar → display name
    //     all visually centered as one block.
    //   - Joined date pinned to column bottom so the three Overview columns
    //     align along their footer.
    <div className="flex flex-col items-center text-center w-full h-full">
      <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full">
        {/* Alliance NFT badge — most users will have this */}
        {hasAlliance && (
          <>
            <AllianceBadge variant="full" className="hidden sm:inline-flex" />
            <AllianceBadge variant="compact" className="sm:hidden" />
          </>
        )}
        {/* Genesis Pass badge — rarer (~400 holders) */}
        {hasGenesisPass && (
          <>
            <GenesisPassBadge variant="full" className="hidden sm:inline-flex" />
            <GenesisPassBadge variant="compact" className="sm:hidden" />
          </>
        )}
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border border-uju-border/60 bg-uju-bg/50 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          {avatarUrl && !imgError ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : profile?.walletAddress ? (
            // pixel + square: GitHub-identicon style 5x5 grid. Rounded corners
            // come from the surrounding container, not the SVG itself.
            <Avatar
              size={128}
              name={profile.walletAddress}
              variant="pixel"
              square
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-nasun-c4 to-nasun-c5" />
          )}
        </div>
        <p className="text-xl sm:text-2xl font-semibold text-uju-primary truncate max-w-full">
          {displayName || "—"}
        </p>
      </div>
      {joinedLabel && (
        <p className="text-sm text-uju-secondary pt-2">
          Joined {joinedLabel}
        </p>
      )}
    </div>
  );

  if (bare) return body;
  return <UjuCard className="h-full">{body}</UjuCard>;
}
