import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { HealthStatusBar } from "@/sections/myAccount/HealthStatusBar";
import { UjuCard } from "../shared/UjuCard";

export function HealthGaugeCard() {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const cognitoToken = user?.cognitoToken;

  const { score, isLoading: scoreLoading } = useEcosystemScore(identityId);
  const { getActivation, isLoading: statusLoading } = useEcosystemStatus(
    cognitoToken,
    identityId,
  );

  const hasGenesisPass = !!getActivation("genesis-pass");
  const hasActiveNft =
    !!getActivation("alliance") ||
    !!getActivation("genesis-pass") ||
    !!getActivation("battalion");

  const activeDays = score?.weekly.activeDays ?? 0;
  const isPenalized = score?.isPenalized ?? false;
  const isLoading = scoreLoading || statusLoading;

  return (
    <UjuCard className="min-h-[200px]">
      <HealthStatusBar
        activeDays={activeDays}
        isPenalized={isPenalized}
        hasGenesisPass={hasGenesisPass}
        hasActiveNft={hasActiveNft}
        isLoading={isLoading}
      />
    </UjuCard>
  );
}
