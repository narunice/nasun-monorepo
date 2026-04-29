import { FC } from "react";
import { UjuConnectedAccountsCard } from "./cards/UjuConnectedAccountsCard";
import { UjuDangerZoneCard } from "./cards/UjuDangerZoneCard";
import { NotificationsPanel } from "./NotificationsPanel";

export const ProfileTab: FC = () => {
  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-12">
      {/* 1. Notifications (Always first) */}
      <NotificationsPanel />

      {/* 2. Connected Accounts & Socials */}
      <UjuConnectedAccountsCard />

      {/* 3. Account Deletion & Irreversible Actions */}
      <UjuDangerZoneCard />
    </div>
  );
};
