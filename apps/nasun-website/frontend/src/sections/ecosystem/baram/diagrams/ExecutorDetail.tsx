import { useTranslation } from "react-i18next";
import { MermaidDiagram } from "./MermaidDiagram";
import executorLifecycleSvg from "./svg/executor-lifecycle.svg?raw";

export function ExecutorDetail() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-8">
      {/* Executor Lifecycle */}
      <div className="bg-cyan-50/50 border border-cyan-400/20 rounded-xl p-5 shadow-sm">
        <h5 className="font-semibold mb-4">
          Executor Lifecycle
        </h5>
        <MermaidDiagram
          svg={executorLifecycleSvg}
          alt="Executor Lifecycle Diagram"
          className="max-h-[600px] overflow-y-auto [&>svg]:max-w-[80%] [&>svg]:mx-auto"
        />
      </div>

      {/* Tier Thresholds */}
      <div className="bg-teal-50/50 border border-teal-400/20 rounded-xl p-5 shadow-sm">
        <h5 className="font-semibold mb-2">
          Tier Thresholds
        </h5>
        <p className="text-nasun-c4 text-sm font-mono mb-4">
          tier = min(stake_tier, reputation_tier)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-black/10">
                {(["tier", "name", "stake", "reputation"] as const).map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                    {t(`executor.tierTable.headers.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["open", "bronze", "silver", "gold"] as const).map((row) => {
                const rowColors: Record<string, string> = {
                  open: "bg-yellow-50/50",
                  bronze: "bg-yellow-50/30",
                  silver: "bg-gray-50/50",
                  gold: "bg-orange-50/50",
                };
                return (
                  <tr key={row} className={`${rowColors[row]} border-b border-nasun-black/5`}>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                      {t(`executor.tierTable.rows.${row}.tier`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                      {t(`executor.tierTable.rows.${row}.name`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/60">
                      {t(`executor.tierTable.rows.${row}.stake`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/60">
                      {t(`executor.tierTable.rows.${row}.reputation`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slashing Rules */}
      <div className="bg-red-50/30 border border-red-400/20 rounded-xl p-5 shadow-sm">
        <h5 className="font-semibold mb-4">
          Slashing Rules
        </h5>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-black/10">
                {(["violation", "penalty", "reputation"] as const).map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                    {t(`executor.slashingTable.headers.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["timeout", "attestation", "fraud"] as const).map((key) => {
                const slashColors: Record<string, string> = {
                  timeout: "bg-yellow-50/50",
                  attestation: "bg-orange-50/50",
                  fraud: "bg-red-50/50",
                };
                return (
                  <tr key={key} className={`${slashColors[key]} border-b border-nasun-black/5`}>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                      {t(`executor.slashingTable.rows.${key}.violation`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                      {t(`executor.slashingTable.rows.${key}.penalty`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                      {t(`executor.slashingTable.rows.${key}.reputation`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-nasun-black/40 text-xs mt-3 italic border-t border-nasun-black/10 pt-3">
          {t("executor.slashingTable.dormancy")}
        </p>
      </div>
    </div>
  );
}
