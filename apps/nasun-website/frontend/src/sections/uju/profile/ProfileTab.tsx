import { FC } from "react";
import { UjuConnectedWalletsCard } from "./cards/UjuConnectedWalletsCard";
import { UjuConnectedSocialsCard } from "./cards/UjuConnectedSocialsCard";
import { UjuDangerZoneCard } from "./cards/UjuDangerZoneCard";
import { NotificationsPanel } from "./NotificationsPanel";
import { UjuCard, UjuSectionHeader } from "../shared";
import { useConsumeScrollTarget } from "../shared/ujuNavigation";
import { ProfileIdentityBlock } from "@/components/profile/ProfileIdentityBlock";

export const ProfileTab: FC = () => {
  // Honor the dashboard's "Manage in Connected Wallets..." CTA: when set,
  // scroll to the Connected Wallets card on mount.
  useConsumeScrollTarget("connected-accounts");
  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-12">
      <UjuCard>
        <UjuSectionHeader accent title="Profile" subtitle="Change your profile picture and display name" />
        <div className="pt-2">
          <ProfileIdentityBlock variant="uju" />
        </div>
      </UjuCard>

      <NotificationsPanel />

      <UjuConnectedWalletsCard />

      <UjuConnectedSocialsCard />

      <UjuDangerZoneCard />
    </div>
  );
};
