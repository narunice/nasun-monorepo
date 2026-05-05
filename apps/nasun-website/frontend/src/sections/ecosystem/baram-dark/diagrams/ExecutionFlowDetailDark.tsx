import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { Lock, Zap, Clock, Wallet, Tag, ListChecks, Timer } from "lucide-react";
import { flowStepsDark } from "./flowSteps";
import { OuterBox } from "@/components/ui/OuterBox";

const budgetLayers = [
  { key: "identity" as const, Icon: Lock, bg: "bg-br-2/20 text-br-2" },
  { key: "active" as const, Icon: Zap, bg: "bg-br-4/20 text-br-4" },
  { key: "expiry" as const, Icon: Clock, bg: "bg-br-3/20 text-br-3" },
  { key: "balance" as const, Icon: Wallet, bg: "bg-br-1/20 text-br-1" },
  { key: "perRequest" as const, Icon: Tag, bg: "bg-br-2/20 text-br-2" },
  { key: "category" as const, Icon: ListChecks, bg: "bg-br-1/20 text-br-1" },
  { key: "rateLimit" as const, Icon: Timer, bg: "bg-br-3/20 text-br-3" },
];

const aerCategories = [
  "whoRequester",
  "whoExecutor",
  "howMuch",
  "what",
  "why",
  "trust",
  "when",
  "chain",
] as const;

export function ExecutionFlowDetailDark() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-8">
      {/* AER: On-Chain Receipt */}
      <div>
        <h6 className="font-semibold text-nasun-white mb-4">{t("aer.headline")}</h6>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {aerCategories.map((key) => (
            <OuterBox key={key} color="nw0" padding="sm" className="!py-3 !px-3">
              <p className="text-nasun-nw4 font-medium text-sm uppercase tracking-wider mb-1">
                {t(`aer.categories.${key}.label`)}
              </p>
              <p className="text-sm">{t(`aer.categories.${key}.detail`)}</p>
            </OuterBox>
          ))}
        </div>
      </div>

      {/* Budget Delegation */}
      <div>
        <h6 className="font-semibold text-nasun-white mb-4">{t("budget.headline")}</h6>
        <div className="space-y-2">
          {budgetLayers.map(({ key, Icon, bg }) => (
            <OuterBox
              key={key}
              color="c6"
              padding="sm"
              className="flex items-center gap-3 !py-3 !px-3 !border-nasun-c7/40"
            >
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline gap-2 flex-1 min-w-0">
                <span className="text-br-1 font-mono text-xs">
                  L{t(`budget.layers.${key}.number`)}
                </span>
                <span className="text-nasun-white font-medium">
                  {t(`budget.layers.${key}.name`)}
                </span>
                <span className="text-nasun-white/50 hidden md:inline">
                  — {t(`budget.layers.${key}.rule`)}
                </span>
              </div>
            </OuterBox>
          ))}
        </div>
      </div>

      {/* Step-by-step detail */}
      <div>
        <h5 className="font-semibold text-nasun-white mb-4">Step-by-Step</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {flowStepsDark.map(({ key, icon: Icon }, i) => {
            const iconColors = [
              "bg-br-2/20 text-br-2", "bg-br-3/20 text-br-3",
              "bg-br-2/20 text-br-2", "bg-br-1/20 text-br-1",
              "bg-br-4/20 text-br-4", "bg-br-1/20 text-br-1",
              "bg-br-1/20 text-br-1", "bg-br-3/20 text-br-3",
            ];
            return (
            <OuterBox
              key={key}
              color="nw0"
              padding="sm"
              className="flex items-start gap-3 !py-3 !px-3"
            >
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-lg ${iconColors[i]} flex items-center justify-center`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div>
                <h6 className="font-medium text-nasun-white text-sm">
                  {t(`flow.steps.${key}.title`)}
                </h6>
                <p className="text-sm text-nasun-white/70 mt-0.5">
                  {t(`flow.steps.${key}.detail`)}
                </p>
              </div>
            </OuterBox>
            );
          })}
        </div>
      </div>
    </div>
  );
}
