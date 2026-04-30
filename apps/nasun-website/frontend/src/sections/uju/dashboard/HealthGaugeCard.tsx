import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader } from "../shared";
import { DonutRing, type RingTheme } from "./UjuHealthStatus";

// Per-NFT tone: alliance=pado-2, genesis=pado-4, locked=uju-border
const SLOT_THEMES: Record<"alliance" | "genesis", { active: RingTheme; locked: RingTheme }> = {
  alliance: {
    active: { strokeClass: "stroke-pado-2", trackClass: "stroke-pado-2/15", pulse: false },
    locked: { strokeClass: "stroke-uju-border", trackClass: "stroke-uju-border", pulse: false },
  },
  genesis: {
    active: { strokeClass: "stroke-pado-4", trackClass: "stroke-pado-4/15", pulse: false },
    locked: { strokeClass: "stroke-uju-border", trackClass: "stroke-uju-border", pulse: false },
  },
};

interface HealthDonutSlotProps {
  hasNft: boolean;
  percent: number;
  restDays: number;
  tone: "alliance" | "genesis";
  title: string;
}

function HealthDonutSlot({ hasNft, percent, restDays, tone, title }: HealthDonutSlotProps) {
  const theme = hasNft ? SLOT_THEMES[tone].active : SLOT_THEMES[tone].locked;
  const label = hasNft ? `${percent}%` : "Locked";
  const restLabel = !hasNft ? null : restDays > 0 ? `Resting: ${restDays}d` : "Active";

  return (
    <div className="flex flex-col items-center gap-2">
      <DonutRing percent={hasNft ? percent : 0} {...theme} label={label} />
      <span className="text-sm font-light text-uju-secondary">{title}</span>
      {restLabel && (
        <span className="text-sm text-uju-secondary/70">{restLabel}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// V1 fallback: binary Active/Locked donuts (no health data from API yet)
// ---------------------------------------------------------------------------

import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";

function LegacyHealthDonut({
  active,
  tone,
  title,
}: {
  active: boolean;
  tone: "alliance" | "genesis";
  title: string;
}) {
  const theme = active ? SLOT_THEMES[tone].active : SLOT_THEMES[tone].locked;
  return (
    <div className="flex flex-col items-center gap-2">
      <DonutRing percent={active ? 100 : 0} {...theme} label={active ? "Active" : "Locked"} />
      <span className="text-sm font-light text-uju-secondary">{title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function HealthGaugeCard() {
  const { user } = useAuth();
  const { score, isLoading } = useEcosystemScore(user?.identityId);
  const { getActivation, isLoading: statusLoading } = useEcosystemStatus(
    user?.cognitoToken,
    user?.identityId,
  );

  const multiplier = score?.multiplier ?? null;

  // V2 health data present
  if (score?.health) {
    const { alliance, genesisPass } = score.health;
    return (
      <UjuCard className="min-h-[260px] flex flex-col">
        <UjuSectionHeader accent title="Health Status" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="flex items-start justify-center gap-6 w-full">
            <HealthDonutSlot
              hasNft={alliance.hasNft}
              percent={alliance.pct}
              restDays={alliance.restDays}
              tone="alliance"
              title="Alliance"
            />
            <HealthDonutSlot
              hasNft={genesisPass.hasNft}
              percent={genesisPass.pct}
              restDays={genesisPass.restDays}
              tone="genesis"
              title="Genesis Pass"
            />
          </div>
          <div className="w-full rounded-xl bg-pado-5/10 border border-pado-5/30 p-3">
            <p className="text-base font-light text-uju-secondary">Multiplier</p>
            <p className="text-xl font-semibold text-pado-5 tabular-nums mt-1">
              {(multiplier ?? 0).toFixed(2)}x
            </p>
          </div>
        </div>
      </UjuCard>
    );
  }

  // Loading state
  if (isLoading || statusLoading) {
    return (
      <UjuCard className="min-h-[260px] flex items-center justify-center">
        <Spinner size="sm" />
      </UjuCard>
    );
  }

  // V1 fallback: binary display
  const hasAllianceActive = !!getActivation("alliance");
  const hasGenesisActive = !!getActivation("genesis-pass");

  return (
    <UjuCard className="min-h-[260px] flex flex-col">
      <UjuSectionHeader accent title="Health Status" />
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="flex items-start justify-center gap-6 w-full">
          <LegacyHealthDonut active={hasAllianceActive} tone="alliance" title="Alliance" />
          <LegacyHealthDonut active={hasGenesisActive} tone="genesis" title="Genesis Pass" />
        </div>
        <div className="w-full rounded-xl bg-pado-5/10 border border-pado-5/30 p-3">
          <p className="text-base font-light text-uju-secondary">Multiplier</p>
          <p className="text-xl font-semibold text-pado-5 tabular-nums mt-1">
            {(multiplier ?? 0).toFixed(2)}x
          </p>
        </div>
      </div>
    </UjuCard>
  );
}
