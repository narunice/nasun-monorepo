import { useTranslation } from "react-i18next";
import { Star, Coins, Award, Eye } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";

const cards = [
  { key: "reputation" as const, icon: Star, color: "border-cyan-300/30 hover:border-cyan-300/50", iconBg: "bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600" },
  { key: "staking" as const, icon: Coins, color: "border-teal-300/30 hover:border-teal-300/50", iconBg: "bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600" },
  { key: "tiers" as const, icon: Award, color: "border-purple-300/30 hover:border-purple-300/50", iconBg: "bg-gradient-to-br from-purple-50 to-violet-50 text-purple-600" },
  { key: "tee" as const, icon: Eye, color: "border-green-300/30 hover:border-green-300/50", iconBg: "bg-gradient-to-br from-green-50 to-emerald-50 text-green-600" },
];

export function ExecutorOverviewDiagram() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {cards.map(({ key, icon: Icon, color, iconBg }) => (
        <StaggerItem key={key} className="h-full">
          <div className={`h-full bg-white/60 border ${color} rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200`}>
            <div className={`w-12 h-12 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className="w-6 h-6" />
            </div>
            <h6 className="font-semibold mb-2">
              {t(`executor.cards.${key}.title`)}
            </h6>
            <p className="!text-sm leading-relaxed">
              {t(`executor.cards.${key}.description`)}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
