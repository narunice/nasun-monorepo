import { useTranslation } from "react-i18next";
import { FileCheck, Lock, Zap, Timer, Clock, Shield } from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";
import escrowStateSvg from "./svg/escrow-state.svg?raw";
import teeSecuritySvg from "./svg/tee-security.svg?raw";

const securityInvariants = [
  { key: "aer" as const, Icon: FileCheck },
  { key: "budget" as const, Icon: Lock },
  { key: "killSwitch" as const, Icon: Zap },
  { key: "rateLimit" as const, Icon: Timer },
  { key: "timeWindows" as const, Icon: Clock },
  { key: "executor" as const, Icon: Shield },
];

export function TrustDetail() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-8">
      {/* TEE Security Boundary */}
      <div className="bg-green-50/50 border border-green-400/20 rounded-xl p-5 shadow-sm">
        <h5 className="font-semibold mb-4">
          {t("trust.detail.hardware.title")}
        </h5>
        <MermaidDiagram
          svg={teeSecuritySvg}
          alt="TEE Security Boundary Diagram"
          className="overflow-x-auto [&>svg]:!w-[2520px] [&>svg]:max-w-none [&>svg]:h-auto"
        />
        <div className="space-y-2 mt-4">
          {(t("trust.detail.hardware.zones", { returnObjects: true }) as string[]).map(
            (zone, i) => {
              const zoneColors = [
                "border-blue-400/20 bg-blue-50",
                "border-red-400/20 bg-red-50",
                "border-yellow-400/20 bg-yellow-50",
                "border-green-400/20 bg-green-50",
              ];
              return (
                <div key={i} className={`border ${zoneColors[i]} rounded-lg px-4 py-2`}>
                  <span className="text-nasun-black/60 text-xs font-mono">{zone}</span>
                </div>
              );
            }
          )}
        </div>
        <p className="!text-xs mt-3 italic opacity-60">
          {t("trust.detail.hardware.note")}
        </p>
      </div>

      {/* Escrow State Machine */}
      <div className="bg-orange-50/50 border border-orange-400/20 rounded-xl p-5 shadow-sm">
        <h5 className="font-semibold mb-4">
          {t("trust.detail.escrow.title")}
        </h5>
        <MermaidDiagram
          svg={escrowStateSvg}
          alt="Escrow State Machine Diagram"
          className="[&>svg]:max-w-[68%] [&>svg]:mx-auto"
        />
        <div className="space-y-2 mt-4">
          {(["pending", "executing", "completed", "cancelled", "timedOut"] as const).map(
            (key) => {
              const stateColors: Record<string, string> = {
                pending: "bg-blue-50 text-blue-600",
                executing: "bg-yellow-50 text-yellow-700",
                completed: "bg-green-50 text-green-600",
                cancelled: "bg-gray-100 text-nasun-black/50",
                timedOut: "bg-red-50 text-red-600",
              };
              return (
                <div key={key} className="flex items-start gap-3">
                  <span className={`${stateColors[key]} text-xs font-mono px-2 py-1 rounded flex-shrink-0 min-w-[90px] text-center`}>
                    {key}
                  </span>
                  <p className="!text-sm">
                    {t(`trust.detail.escrow.states.${key}`)}
                  </p>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* Security Invariants (merged from standalone section) */}
      <div>
        <h5 className="font-semibold mb-4">
          {t("security.headline")}
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {securityInvariants.map(({ key, Icon }) => (
            <div
              key={key}
              className="bg-white/60 border border-nasun-c4/10 rounded-lg p-3 flex gap-3 shadow-sm"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <p className="!text-sm">
                {t(`security.invariants.${key}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
