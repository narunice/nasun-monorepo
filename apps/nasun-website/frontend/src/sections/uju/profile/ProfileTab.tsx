import { ConnectedAccountsCard } from "@/sections/myAccount/ConnectedAccountsCard";
import { DangerZoneCard } from "@/sections/myAccount/DangerZoneCard";
import { NotificationsPlaceholder } from "./NotificationsPlaceholder";

export function ProfileTab() {
  return (
    <div className="space-y-4">
      <NotificationsPlaceholder />
      <ConnectedAccountsCard />
      <DangerZoneCard />
    </div>
  );
}
