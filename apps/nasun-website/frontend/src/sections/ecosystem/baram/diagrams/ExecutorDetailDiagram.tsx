import { useTranslation } from "react-i18next";
import { MermaidDiagram } from "./MermaidDiagram";
import executorLifecycleSvg from "./svg/executor-lifecycle.svg?raw";

export function ExecutorDetailDiagram() {
  const { t } = useTranslation("baram");

  const tierKeys = ["open", "bronze", "silver", "gold"] as const;
  const tierRowColors: Record<string, string> = {
    open: "bg-yellow-50/50",
    bronze: "bg-yellow-50/30",
    silver: "bg-gray-50/50",
    gold: "bg-orange-50/50",
  };

  const slashKeys = ["timeout", "attestation", "fraud"] as const;
  const slashRowColors: Record<string, string> = {
    timeout: "bg-yellow-50/50",
    attestation: "bg-orange-50/50",
    fraud: "bg-red-50/50",
  };

  const selectionItems = t("executor.detail.selection.items", {
    returnObjects: true,
  }) as string[];

  return (
    <div className="space-y-8">
      {/* Executor Lifecycle */}
      <div className="bg-cyan-50/50 border border-cyan-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-4">
          {t("executor.detail.lifecycle.title")}
        </h4>
        <MermaidDiagram svg={executorLifecycleSvg} alt="Executor Lifecycle Diagram" className="max-h-[600px] overflow-y-auto [&>svg]:max-w-[80%] [&>svg]:mx-auto" />
      </div>

      {/* Tier Thresholds */}
      <div className="bg-teal-50/50 border border-teal-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-2">
          {t("executor.detail.tiers.title")}
        </h4>
        <p className="text-nasun-c4 text-sm font-mono mb-4">
          {t("executor.detail.tiers.formula")}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-black/10">
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.tiers.headers.tier")}
                </th>
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.tiers.headers.stake")}
                </th>
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.tiers.headers.reputation")}
                </th>
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.tiers.headers.eligible")}
                </th>
              </tr>
            </thead>
            <tbody>
              {tierKeys.map((key) => (
                <tr key={key} className={`${tierRowColors[key]} border-b border-nasun-black/5`}>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                    {t(`executor.detail.tiers.rows.${key}.tier`)}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/60">
                    {t(`executor.detail.tiers.rows.${key}.stake`)}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/60">
                    {t(`executor.detail.tiers.rows.${key}.reputation`)}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/60">
                    {t(`executor.detail.tiers.rows.${key}.eligible`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-nasun-black/40 text-xs mt-3 italic">
          {t("executor.detail.tiers.note")}
        </p>
      </div>

      {/* Selection Algorithm */}
      <div className="bg-cyan-50/50 border border-cyan-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-2">
          {t("executor.detail.selection.title")}
        </h4>
        <p className="text-nasun-c4 text-sm font-mono mb-4">
          {t("executor.detail.selection.formula")}
        </p>
        <div className="space-y-2">
          {selectionItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-nasun-black/30 mt-0.5">&#x2022;</span>
              <span className="text-nasun-black/60 text-xs font-mono">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Slashing Rules */}
      <div className="bg-red-50/30 border border-red-400/20 rounded-xl p-5 shadow-sm">
        <h4 className="text-nasun-black font-semibold mb-4">
          {t("executor.detail.slashing.title")}
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-black/10">
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.slashing.headers.violation")}
                </th>
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.slashing.headers.penalty")}
                </th>
                <th className="text-left py-2 px-3 text-nasun-black/40 text-xs font-medium uppercase tracking-wider">
                  {t("executor.detail.slashing.headers.reputation")}
                </th>
              </tr>
            </thead>
            <tbody>
              {slashKeys.map((key) => (
                <tr key={key} className={`${slashRowColors[key]} border-b border-nasun-black/5`}>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                    {t(`executor.detail.slashing.rows.${key}.violation`)}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                    {t(`executor.detail.slashing.rows.${key}.penalty`)}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-nasun-black/70">
                    {t(`executor.detail.slashing.rows.${key}.reputation`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-nasun-black/40 text-xs mt-3 italic border-t border-nasun-black/10 pt-3">
          {t("executor.detail.slashing.dormancy")}
        </p>
      </div>
    </div>
  );
}
