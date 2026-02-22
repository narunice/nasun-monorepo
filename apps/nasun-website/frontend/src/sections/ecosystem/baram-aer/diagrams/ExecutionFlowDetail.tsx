import { useTranslation } from "react-i18next";
import { Lock, Zap, Clock, Wallet, Tag, ListChecks, Timer } from "lucide-react";
import { flowSteps } from "./ExecutionFlowDiagram";

const budgetLayers = [
  { key: "identity" as const, Icon: Lock, bg: "bg-blue-50 text-blue-600" },
  { key: "active" as const, Icon: Zap, bg: "bg-green-50 text-green-600" },
  { key: "expiry" as const, Icon: Clock, bg: "bg-purple-50 text-purple-600" },
  { key: "balance" as const, Icon: Wallet, bg: "bg-orange-50 text-orange-600" },
  { key: "perRequest" as const, Icon: Tag, bg: "bg-cyan-50 text-cyan-600" },
  { key: "category" as const, Icon: ListChecks, bg: "bg-teal-50 text-teal-600" },
  { key: "rateLimit" as const, Icon: Timer, bg: "bg-rose-50 text-rose-600" },
];

const aerCategories = [
  "whoRequester", "whoExecutor", "howMuch", "what",
  "why", "trust", "when", "chain",
] as const;

export function ExecutionFlowDetail() {
  const { t } = useTranslation("baram-aer");

  return (
    <div className="space-y-8">
      {/* AER: On-Chain Receipt */}
      <div>
        <h5 className="font-semibold mb-4">
          {t("aer.headline")}
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {aerCategories.map((key) => (
            <div key={key} className="bg-white/60 border border-nasun-c4/15 rounded-lg p-3">
              <p className="text-nasun-c4 font-mono text-[11px] uppercase tracking-wider mb-1">
                {t(`aer.categories.${key}.label`)}
              </p>
              <p className="!text-sm">
                {t(`aer.categories.${key}.detail`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Budget Delegation */}
      <div>
        <h5 className="font-semibold mb-4">
          {t("budget.headline")}
        </h5>
        <div className="space-y-2">
          {budgetLayers.map(({ key, Icon, bg }) => (
            <div
              key={key}
              className="flex items-center gap-3 bg-white/60 border border-nasun-c4/10 rounded-lg p-3"
            >
              <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline gap-2 flex-1 min-w-0">
                <span className="text-nasun-c4/40 font-mono text-[11px]">
                  L{t(`budget.layers.${key}.number`)}
                </span>
                <span className="text-nasun-black font-medium text-sm">
                  {t(`budget.layers.${key}.name`)}
                </span>
                <span className="text-nasun-black/40 text-sm hidden md:inline">
                  — {t(`budget.layers.${key}.rule`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step-by-step detail */}
      <div>
        <h5 className="font-semibold mb-4">
          Step-by-Step
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {flowSteps.map(({ key, icon: Icon, color }) => (
            <div
              key={key}
              className="flex items-start gap-3 bg-white/40 border border-nasun-c4/10 rounded-lg p-3"
            >
              <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div>
                <h6 className="font-medium !text-sm">
                  {t(`flow.steps.${key}.title`)}
                </h6>
                <p className="!text-sm mt-0.5">
                  {t(`flow.steps.${key}.detail`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
