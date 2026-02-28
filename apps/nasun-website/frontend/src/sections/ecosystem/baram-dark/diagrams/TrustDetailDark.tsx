import { useTranslation } from "react-i18next";
import { FileCheck, Lock, Zap, Timer, Clock, Shield } from "lucide-react";
import { MermaidDiagramDark } from "./MermaidDiagramDark";
import escrowStateSvg from "../../baram/diagrams/svg/escrow-state.svg?raw";
import teeSecuritySvg from "../../baram/diagrams/svg/tee-security.svg?raw";
import { OuterBox } from "@/components/ui/OuterBox";

const securityInvariants = [
  { key: "aer" as const, Icon: FileCheck },
  { key: "budget" as const, Icon: Lock },
  { key: "killSwitch" as const, Icon: Zap },
  { key: "rateLimit" as const, Icon: Timer },
  { key: "timeWindows" as const, Icon: Clock },
  { key: "executor" as const, Icon: Shield },
];

export function TrustDetailDark() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-8">
      {/* TEE Security Boundary */}
      <OuterBox color="noborder" padding="sm">
        <h5 className="font-semibold text-nasun-white mb-4">
          {t("trust.detail.hardware.title")}
        </h5>
        <MermaidDiagramDark
          svg={teeSecuritySvg}
          alt="TEE Security Boundary Diagram"
          className="overflow-x-auto [&>svg]:!w-[2520px] [&>svg]:max-w-none [&>svg]:h-auto"
        />
        <div className="space-y-2 mt-4">
          {(t("trust.detail.hardware.zones", { returnObjects: true }) as string[]).map(
            (zone, i) => {
              const zoneColors = [
                "border-blue-500/20 bg-blue-500/10",
                "border-red-500/20 bg-red-500/10",
                "border-yellow-500/20 bg-yellow-500/10",
                "border-green-500/20 bg-green-500/10",
              ];
              return (
                <div key={i} className={`border ${zoneColors[i]} rounded-lg px-4 py-2`}>
                  <span className="text-nasun-white/70 text-sm font-mono">{zone}</span>
                </div>
              );
            }
          )}
        </div>
        <p className="text-sm mt-3 italic text-nasun-white/50">
          {t("trust.detail.hardware.note")}
        </p>
      </OuterBox>

      {/* Escrow State Machine */}
      <OuterBox color="noborder" padding="sm">
        <h5 className="font-semibold text-nasun-white mb-4">
          {t("trust.detail.escrow.title")}
        </h5>
        <MermaidDiagramDark
          svg={escrowStateSvg}
          alt="Escrow State Machine Diagram"
          className="[&>svg]:max-w-[68%] [&>svg]:mx-auto"
        />
        <div className="space-y-2 mt-4">
          {(["pending", "executing", "completed", "cancelled", "timedOut"] as const).map(
            (key) => {
              const stateColors: Record<string, string> = {
                pending: "bg-blue-500/15 text-blue-400",
                executing: "bg-yellow-500/15 text-yellow-400",
                completed: "bg-green-500/15 text-green-400",
                cancelled: "bg-gray-500/15 text-gray-400",
                timedOut: "bg-red-500/15 text-red-400",
              };
              return (
                <div key={key} className="flex items-start gap-3">
                  <span className={`${stateColors[key]} text-sm font-mono px-2 py-1 rounded flex-shrink-0 min-w-[90px] text-center`}>
                    {key}
                  </span>
                  <p className="text-nasun-white/80">
                    {t(`trust.detail.escrow.states.${key}`)}
                  </p>
                </div>
              );
            }
          )}
        </div>
      </OuterBox>

      {/* Security Invariants */}
      <div>
        <h5 className="font-semibold text-nasun-white mb-4">
          {t("security.headline")}
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {securityInvariants.map(({ key, Icon }) => (
            <OuterBox
              key={key}
              color="noborder"
              padding="sm"
              className="flex gap-3 !py-3 !px-3"
            >
              <div className="w-7 h-7 rounded-lg bg-nasun-br-4d/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-nasun-br-4" />
              </div>
              <p className="text-sm text-nasun-white/80">
                {t(`security.invariants.${key}`)}
              </p>
            </OuterBox>
          ))}
        </div>
      </div>
    </div>
  );
}
