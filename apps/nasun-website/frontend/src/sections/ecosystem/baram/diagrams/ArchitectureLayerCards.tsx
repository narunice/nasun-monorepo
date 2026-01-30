import { useTranslation } from "react-i18next";
import { Monitor, Link2, ShieldCheck } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";

const layerConfig = [
  { key: "frontend" as const, icon: Monitor, accent: "border-blue-400/20 hover:border-blue-400/40", badge: "bg-blue-50 text-blue-600" },
  { key: "blockchain" as const, icon: Link2, accent: "border-nasun-c4/20 hover:border-nasun-c4/40", badge: "bg-nasun-c4/10 text-nasun-c4" },
  { key: "tee" as const, icon: ShieldCheck, accent: "border-green-400/20 hover:border-green-400/40", badge: "bg-green-50 text-green-600" },
];

export function ArchitectureLayerCards() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="space-y-3">
      {layerConfig.map(({ key, icon: Icon, accent, badge }) => {
        const items = t(`solution.detail.layers.${key}.items`, {
          returnObjects: true,
        }) as string[];

        return (
          <StaggerItem key={key}>
            <div
              className={`bg-white/60 border ${accent} rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200`}
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
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-nasun-black/30 text-xs leading-none">&#x2022;</span>
                    <span className="text-nasun-black/70 text-xs font-mono">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </StaggerItem>
        );
      })}
    </StaggerContainer>
  );
}
