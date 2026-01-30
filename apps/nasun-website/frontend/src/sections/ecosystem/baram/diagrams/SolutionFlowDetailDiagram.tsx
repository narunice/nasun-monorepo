import { useTranslation } from "react-i18next";
import { Monitor, Link2, ShieldCheck } from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";
import userFlowSvg from "./svg/user-flow.svg?raw";

const layerConfig = [
  { key: "frontend" as const, icon: Monitor, accent: "border-blue-400/20", badge: "bg-blue-50 text-blue-600" },
  { key: "blockchain" as const, icon: Link2, accent: "border-nasun-c4/20", badge: "bg-nasun-c4/10 text-nasun-c4" },
  { key: "tee" as const, icon: ShieldCheck, accent: "border-green-400/20", badge: "bg-green-50 text-green-600" },
];

export function SolutionFlowDetailDiagram() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-4">
      <h4 className="text-nasun-black font-semibold text-lg">
        {t("solution.detail.title")}
      </h4>
      <MermaidDiagram svg={userFlowSvg} alt="Baram User Flow Diagram" />
      <div className="space-y-3">
        {layerConfig.map(({ key, icon: Icon, accent, badge }) => {
          const items = t(`solution.detail.layers.${key}.items`, {
            returnObjects: true,
          }) as string[];

          return (
            <div
              key={key}
              className={`bg-nasun-c4/[0.03] border ${accent} rounded-xl p-5 shadow-sm`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg ${badge} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h5 className="text-nasun-black font-medium">
                  {t(`solution.detail.layers.${key}.title`)}
                </h5>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-nasun-black/30 mt-0.5">&#x2022;</span>
                    <span className="text-nasun-black/70 text-xs font-mono">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
