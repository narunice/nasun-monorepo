import { useMemo, useState, useEffect } from "react";
import Avatar from "boring-avatars";
import {
  resolveAvatarUrl,
  resolveDisplayName,
  type EcosystemProfile,
} from "@nasun/profile-react";
import { useUserStore } from "@/store/userStore";
import { useMyProfile } from "@/features/profile/useMyProfile";
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

export function UserInfoCard() {
  const user = useUserStore((s) => s.user);
  const { data: serverProfile } = useMyProfile();

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

  return (
    <UjuCard className="flex items-center gap-4 h-full">
      <div className="w-16 h-16 rounded-full overflow-hidden border border-uju-border/30 shrink-0 bg-uju-bg/50">
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : profile?.walletAddress ? (
          <Avatar size={64} name={profile.walletAddress} variant="beam" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-nasun-c4 to-nasun-c5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl sm:text-2xl font-semibold text-uju-primary truncate">
          {displayName || "—"}
        </p>
      </div>
    </UjuCard>
  );
}
