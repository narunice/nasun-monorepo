import { UjuCard } from "../shared";
import { UserInfoCard } from "./UserInfoCard";
import { TotalPointsCard } from "./TotalPointsCard";
import { HealthGaugeCard } from "./HealthGaugeCard";
import { AllianceActivationCta } from "./AllianceActivationCta";

// Combined dashboard summary card. Two-column layout:
//   left:  user profile (avatar + name + join date), no extra surface.
//   right: tinted panel grouping Nasun Points + Health Status side-by-side.
//          Tint is intentionally lighter than the page bg so the panel reads
//          as the dashboard's "score & state" focal point.
export function OverviewSummaryCard() {
  return (
    <UjuCard>
      {/* Grid (not flex) at md+ so the gap is subtracted from the column
          tracks rather than added to the row width. Previous flex+basis-3/4
          implementation overflowed the UjuCard's right padding by exactly the
          gap value, eating into the apparent right-side breathing room. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 sm:gap-6 items-stretch">
        {/* Left: user profile only — 1/4 width */}
        <div className="md:col-span-1 flex">
          <UserInfoCard bare />
        </div>

        {/* Right: nasun points + health status share a single tinted surface
            — 3/4 width. Symmetric padding on all four sides. */}
        <div className="md:col-span-3 rounded-xl bg-pado-1/[0.12] p-3 sm:p-6 flex flex-col">
          {/* Onboarding CTA: only renders when Alliance/Genesis are not yet
              active. Self-hides otherwise, so the layout below matches the
              steady-state design once the user has activated. */}
          <AllianceActivationCta />
          {/* 55/45 split. Inner gap (gap-6 / 24px) plus extra left-padding
              on the Health Status column give that side breathing room from
              the Nasun Points number, which dominates visually on the left.
              flex-1 (not h-full) so the grid grows to consume remaining
              vertical space after the optional CTA above — h-full would
              resolve against the auto-height parent and collapse, letting
              MultiplierBox's mt-auto push it out of the card. */}
          <div className="grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-5 sm:gap-6 items-stretch flex-1 min-h-0">
            <div className="flex">
              <TotalPointsCard bare />
            </div>
            <div className="flex md:pl-5 lg:pl-7">
              <HealthGaugeCard bare />
            </div>
          </div>
        </div>
      </div>
    </UjuCard>
  );
}
