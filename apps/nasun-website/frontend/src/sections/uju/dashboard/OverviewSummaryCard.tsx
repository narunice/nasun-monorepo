import { UjuCard } from "../shared";
import { UserInfoCard } from "./UserInfoCard";
import { TotalPointsCard } from "./TotalPointsCard";
import { HealthGaugeCard } from "./HealthGaugeCard";

// Combined dashboard summary card. Two-column layout:
//   left:  User info (top) + Nasun Points (bottom)
//   right: Health Status (full height)
// Single outer UjuCard wraps all three sections; inner dividers separate them.
export function OverviewSummaryCard() {
  return (
    <UjuCard>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {/* Left column: user (top) + nasun points (bottom) */}
        <div className="flex flex-col gap-5 sm:gap-6 divide-y divide-uju-border/30">
          <UserInfoCard bare />
          <div className="pt-5 sm:pt-6">
            <TotalPointsCard bare />
          </div>
        </div>

        {/* Right column: health status — full height, vertical divider on md+ */}
        <div className="md:border-l md:border-uju-border/30 md:pl-5 lg:pl-6 border-t border-uju-border/30 pt-5 sm:pt-6 md:border-t-0 md:pt-0">
          <HealthGaugeCard bare />
        </div>
      </div>
    </UjuCard>
  );
}
