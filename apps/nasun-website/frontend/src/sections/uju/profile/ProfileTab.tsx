import { ConnectedAccountsCard } from "@/sections/myAccount/ConnectedAccountsCard";
import { DangerZoneCard } from "@/sections/myAccount/DangerZoneCard";
import { NotificationsPanel } from "./NotificationsPanel";

export function ProfileTab() {
  return (
    <div className="space-y-4">
      <NotificationsPanel />
      <ConnectedAccountsCard />
      <DangerZoneCard />
    </div>
  );
}
