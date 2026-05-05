import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { MermaidDiagramDark } from "./MermaidDiagramDark";
import executorLifecycleSvg from "./svg/executor-lifecycle.svg?raw";
import { OuterBox } from "@/components/ui/OuterBox";

export function ExecutorDetailDark() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-8">
      {/* Executor Lifecycle */}
      <OuterBox color="noborder" padding="sm">
        <h5 className="font-semibold text-nasun-white mb-4">Executor Lifecycle</h5>
        <MermaidDiagramDark
          svg={executorLifecycleSvg}
          alt="Executor Lifecycle Diagram"
          className="max-h-[600px] overflow-y-auto [&>svg]:max-w-[80%] [&>svg]:mx-auto"
        />
      </OuterBox>

      {/* Tier Thresholds */}
      <OuterBox color="noborder" padding="sm">
        <h5 className="font-semibold text-nasun-white mb-2">Tier Thresholds</h5>
        <p className="text-nasun-br-1 text-sm font-mono mb-4">
          tier = min(stake_tier, reputation_tier)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-white/20">
                {(["tier", "name", "stake", "reputation"] as const).map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-nasun-white/90 text-xs font-medium uppercase tracking-wider"
                  >
                    {t(`executor.tierTable.headers.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["open", "bronze", "silver", "gold"] as const).map((row) => {
                const rowColors: Record<string, string> = {
                  open: "bg-yellow-500/5",
                  bronze: "bg-yellow-500/3",
                  silver: "bg-gray-500/5",
                  gold: "bg-orange-500/5",
                };
                return (
                  <tr key={row} className={`${rowColors[row]} border-b border-nasun-white/15`}>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/90">
                      {t(`executor.tierTable.rows.${row}.tier`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/90">
                      {t(`executor.tierTable.rows.${row}.name`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/80">
                      {t(`executor.tierTable.rows.${row}.stake`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/80">
                      {t(`executor.tierTable.rows.${row}.reputation`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </OuterBox>

      {/* Slashing Rules */}
      <OuterBox color="noborder" padding="sm">
        <h5 className="font-semibold text-nasun-white mb-4">Slashing Rules</h5>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-white/20">
                {(["violation", "penalty", "reputation"] as const).map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-nasun-white/90 text-xs font-medium uppercase tracking-wider"
                  >
                    {t(`executor.slashingTable.headers.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["timeout", "attestation", "fraud"] as const).map((key) => {
                const slashColors: Record<string, string> = {
                  timeout: "bg-yellow-500/5",
                  attestation: "bg-orange-500/5",
                  fraud: "bg-red-500/5",
                };
                return (
                  <tr key={key} className={`${slashColors[key]} border-b border-nasun-white/15`}>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/90">
                      {t(`executor.slashingTable.rows.${key}.violation`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/90">
                      {t(`executor.slashingTable.rows.${key}.penalty`)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-nasun-white/90">
                      {t(`executor.slashingTable.rows.${key}.reputation`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className=" text-sm mt-3 italic border-t border-nasun-white/20 pt-3">
          {t("executor.slashingTable.dormancy")}
        </p>
      </OuterBox>
    </div>
  );
}
