import { useAuth } from "@/features/auth";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader } from "../shared";

// ---------------------------------------------------------------------------
// Health donut visual (mockup)
//
// Pure visual structure for now. Shows two donut rings: Alliance and Genesis
// Pass. Each is binary Active/Locked. The actual multiplier formula is being
// reworked separately, so we deliberately avoid encoding any real percent here
// — when the formula PR lands, swap the data source without touching layout.
// ---------------------------------------------------------------------------

const SIZE = 100;
const STROKE_WIDTH = 10;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Tone = "alliance" | "genesis" | "locked";

const RING_THEME: Record<Tone, { strokeClass: string; trackClass: string }> = {
  alliance: { strokeClass: "stroke-pado-2", trackClass: "stroke-pado-2/15" },
  genesis: { strokeClass: "stroke-pado-4", trackClass: "stroke-pado-4/15" },
  locked: { strokeClass: "stroke-uju-border", trackClass: "stroke-uju-border" },
};

interface HealthDonutProps {
  active: boolean;
  tone: Exclude<Tone, "locked">;
  title: string;
}

function HealthDonut({ active, tone, title }: HealthDonutProps) {
  const theme = active ? RING_THEME[tone] : RING_THEME.locked;
  const percent = active ? 100 : 0;
  const dashOffset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full h-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            className={theme.trackClass}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={`${theme.strokeClass} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-sm font-semibold tabular-nums ${
              active ? "text-uju-primary" : "text-uju-secondary"
            }`}
          >
            {active ? "Active" : "Locked"}
          </span>
        </div>
      </div>
      <span className="text-sm font-medium text-uju-secondary">{title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function HealthGaugeCard() {
  const { user } = useAuth();
  const { getActivation, isLoading } = useEcosystemStatus(
    user?.cognitoToken,
    user?.identityId,
  );

  const hasAllianceActive = !!getActivation("alliance");
  const hasGenesisActive = !!getActivation("genesis-pass");

  return (
    <UjuCard className="min-h-[260px] flex flex-col">
      <UjuSectionHeader accent title="Health Status" />
      <div className="flex-1 flex items-center justify-center">
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <div className="flex items-start justify-center gap-6 w-full">
            <HealthDonut
              active={hasAllianceActive}
              tone="alliance"
              title="Alliance"
            />
            <HealthDonut
              active={hasGenesisActive}
              tone="genesis"
              title="Genesis Pass"
            />
          </div>
        )}
      </div>
    </UjuCard>
  );
}
