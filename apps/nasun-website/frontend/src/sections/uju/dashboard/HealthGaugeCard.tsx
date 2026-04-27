import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { UjuCard, UjuSectionHeader } from "../shared";
import { UjuHealthStatus } from "./UjuHealthStatus";

export function HealthGaugeCard() {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const cognitoToken = user?.cognitoToken;

  const { score, isLoading: scoreLoading } = useEcosystemScore(identityId);
  const { getActivation, isLoading: statusLoading } = useEcosystemStatus(cognitoToken, identityId);

  const hasGenesisPass = !!getActivation("genesis-pass");
  const hasActiveNft =
    !!getActivation("alliance") || !!getActivation("genesis-pass") || !!getActivation("battalion");

  return (
    <UjuCard className="min-h-[260px] flex flex-col">
      <UjuSectionHeader accent title="Health Status" />
      <div className="flex-1 flex items-center justify-center">
        <UjuHealthStatus
          activeDays={score?.weekly.activeDays ?? 0}
          isPenalized={score?.isPenalized ?? false}
          hasGenesisPass={hasGenesisPass}
          hasActiveNft={hasActiveNft}
          isLoading={scoreLoading || statusLoading}
        />
      </div>
    </UjuCard>
  );
}
