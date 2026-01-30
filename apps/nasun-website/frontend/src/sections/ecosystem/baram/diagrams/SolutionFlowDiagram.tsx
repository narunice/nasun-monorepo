import { useTranslation } from "react-i18next";
import {
  MessageSquare,
  Lock,
  Users,
  Cpu,
  Coins,
  ClipboardCheck,
  ArrowRight,
  ArrowDown,
} from "lucide-react";

const steps = [
  { key: "prompt" as const, icon: MessageSquare, color: "bg-blue-50 text-blue-600" },
  { key: "encrypt" as const, icon: Lock, color: "bg-purple-50 text-purple-600" },
  { key: "select" as const, icon: Users, color: "bg-cyan-50 text-cyan-600" },
  { key: "tee" as const, icon: Cpu, color: "bg-green-50 text-green-600" },
  { key: "settle" as const, icon: Coins, color: "bg-orange-50 text-orange-600" },
  { key: "record" as const, icon: ClipboardCheck, color: "bg-nasun-c4/10 text-nasun-c4" },
];

export function SolutionFlowDiagram() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-8">
      {/* Flow */}
      <div className="flex flex-col lg:flex-row items-center gap-3 lg:gap-1">
        {steps.map(({ key, icon: Icon, color }, i) => (
          <div key={key} className="flex items-center gap-1 lg:gap-1 w-full lg:w-auto">
            <div className="flex-1 lg:flex-initial bg-nasun-c4/[0.03] border border-nasun-c4/15 rounded-xl p-4 lg:p-5 text-center min-w-0 lg:min-w-[130px] shadow-sm">
              <div
                className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mx-auto mb-2`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-nasun-black font-medium text-sm">
                {t(`solution.steps.${key}.title`)}
              </p>
              <p className="text-nasun-black/35 text-xs mt-1">
                {t(`solution.steps.${key}.subtitle`)}
              </p>
            </div>
            {i < steps.length - 1 && (
              <>
                <ArrowRight className="hidden lg:block w-4 h-4 text-nasun-black/20 flex-shrink-0" />
                <ArrowDown className="lg:hidden w-4 h-4 text-nasun-black/20 flex-shrink-0" />
              </>
            )}
          </div>
        ))}
      </div>

      {/* On-Chain Bar */}
      <div className="bg-nasun-c4/[0.06] border border-nasun-c4/20 rounded-xl p-4">
        <p className="text-nasun-c4 text-xs font-medium uppercase tracking-wider mb-3">
          {t("solution.onChainBar")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["baram", "executor", "compliance"] as const).map((key) => (
            <div
              key={key}
              className="bg-white border border-nasun-c4/10 rounded-lg px-3 py-2 text-center"
            >
              <span className="text-emerald-600 text-xs font-mono">
                {t(`solution.contracts.${key}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
