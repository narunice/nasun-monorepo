import { FC } from "react";
import { UjuConnectedAccountsCard } from "./cards/UjuConnectedAccountsCard";
import { UjuDangerZoneCard } from "./cards/UjuDangerZoneCard";
import { NotificationsPanel } from "./NotificationsPanel";
import { UjuCard, UjuSectionHeader } from "../shared";
import { ProfileIdentityBlock } from "@/components/profile/ProfileIdentityBlock";

export const ProfileTab: FC = () => {
  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-12">
      {/* 1. Profile Identity (avatar + display name + edit) */}
      <UjuCard>
        <UjuSectionHeader accent title="Profile" subtitle="Change your profile picture and display name" />
        <div className="pt-2">
          <ProfileIdentityBlock variant="uju" />
        </div>
      </UjuCard>

      {/* 2. Notifications */}
      <NotificationsPanel />

      {/* 3. Connected Accounts & Socials */}
      <UjuConnectedAccountsCard />

      {/* 4. Account Deletion & Irreversible Actions */}
      <UjuDangerZoneCard />
    </div>
  );
};
