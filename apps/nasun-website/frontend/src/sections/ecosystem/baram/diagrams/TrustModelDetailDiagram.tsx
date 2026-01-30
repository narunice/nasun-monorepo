import { useTranslation } from "react-i18next";
import { MermaidDiagram } from "./MermaidDiagram";
import teeSecuritySvg from "./svg/tee-security.svg?raw";
import escrowStateSvg from "./svg/escrow-state.svg?raw";

export function TrustModelDetailDiagram() {
  const { t } = useTranslation("baram");

  const zones = t("trust.detail.hardware.zones", {
    returnObjects: true,
  }) as string[];

  const stateKeys = [
    "pending",
    "executing",
    "completed",
    "cancelled",
    "timedOut",
  ] as const;

  const tierKeys = ["open", "bronze", "silver", "gold"] as const;
  const tierColors = [
    "text-nasun-black/40",
    "text-yellow-600",
    "text-gray-500",
    "text-orange-600",
  ];

  const slashKeys = ["timeout", "attestation", "fraud"] as const;
  const slashColors = ["text-yellow-600", "text-orange-600", "text-red-600"];

  const ecrFields = t("trust.detail.compliance.fields", {
    returnObjects: true,
  }) as string[];

  return (
    <div className="space-y-8">
      {/* Hardware Isolation */}
      <div className="bg-green-50/50 border border-green-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-4">
          {t("trust.detail.hardware.title")}
        </h4>
        <MermaidDiagram svg={teeSecuritySvg} alt="TEE Security Boundary Diagram" />
        <div className="space-y-2 mt-4">
          {zones.map((zone, i) => {
            const zoneColors = [
              "border-blue-400/20 bg-blue-50",
              "border-red-400/20 bg-red-50",
              "border-yellow-400/20 bg-yellow-50",
              "border-green-400/20 bg-green-50",
            ];
            return (
              <div
                key={i}
                className={`border ${zoneColors[i]} rounded-lg px-4 py-3`}
              >
                <span className="text-nasun-black/60 text-xs font-mono">{zone}</span>
              </div>
            );
          })}
        </div>
        <p className="text-nasun-black/40 text-xs mt-3 italic">
          {t("trust.detail.hardware.note")}
        </p>
      </div>

      {/* Escrow State Machine */}
      <div className="bg-orange-50/50 border border-orange-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-4">
          {t("trust.detail.escrow.title")}
        </h4>
        <MermaidDiagram svg={escrowStateSvg} alt="Escrow State Machine Diagram" />
        <div className="space-y-2 mt-4">
          {stateKeys.map((key) => {
            const stateColors: Record<string, string> = {
              pending: "bg-blue-50 text-blue-600",
              executing: "bg-yellow-50 text-yellow-700",
              completed: "bg-green-50 text-green-600",
              cancelled: "bg-gray-100 text-nasun-black/50",
              timedOut: "bg-red-50 text-red-600",
            };
            return (
              <div key={key} className="flex items-start gap-3">
                <span
                  className={`${stateColors[key]} text-xs font-mono px-2 py-1 rounded flex-shrink-0 min-w-[90px] text-center`}
                >
                  {key}
                </span>
                <span className="text-nasun-black/50 text-sm">
                  {t(`trust.detail.escrow.states.${key}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staking & Tier */}
      <div className="bg-purple-50/50 border border-purple-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-2">
          {t("trust.detail.stake.title")}
        </h4>
        <p className="text-nasun-c4 text-sm font-mono mb-4">
          {t("trust.detail.stake.formula")}
        </p>

        <div className="space-y-2 mb-4">
          {tierKeys.map((key, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className={`${tierColors[i]} text-xs font-mono min-w-[200px]`}>
                {t(`trust.detail.stake.tiers.${key}`)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-nasun-black/40 text-xs font-medium uppercase tracking-wider mb-2">
          Slashing
        </p>
        <div className="space-y-1">
          {slashKeys.map((key, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className={`${slashColors[i]} text-xs font-mono`}>
                {key}: {t(`trust.detail.stake.slashing.${key}`)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-nasun-black/40 text-xs mt-4 italic border-t border-nasun-black/10 pt-3">
          {t("trust.detail.stake.philosophy")}
        </p>
      </div>

      {/* Compliance Records */}
      <div className="bg-nasun-c4/[0.04] border border-nasun-c4/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-4">
          {t("trust.detail.compliance.title")}
        </h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {ecrFields.map((field, i) => (
            <span
              key={i}
              className="bg-nasun-c4/10 text-nasun-c4 text-xs font-mono px-2 py-1 rounded"
            >
              {field}
            </span>
          ))}
        </div>
        <p className="text-emerald-600 text-sm font-medium italic">
          {t("trust.detail.compliance.note")}
        </p>
      </div>
    </div>
  );
}
