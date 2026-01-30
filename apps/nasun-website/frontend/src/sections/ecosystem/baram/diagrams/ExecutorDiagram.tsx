import { useTranslation } from "react-i18next";
import { Server, Coins, Award, Shuffle } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";

const cards = [
  { key: "teeWorkers" as const, icon: Server, color: "border-cyan-300/30 hover:border-cyan-300/50", iconBg: "bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600" },
  { key: "stakeEarn" as const, icon: Coins, color: "border-teal-300/30 hover:border-teal-300/50", iconBg: "bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600" },
  { key: "tierSystem" as const, icon: Award, color: "border-cyan-300/30 hover:border-cyan-300/50", iconBg: "bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600" },
  { key: "autoSelection" as const, icon: Shuffle, color: "border-teal-300/30 hover:border-teal-300/50", iconBg: "bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600" },
];

export function ExecutorDiagram() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {cards.map(({ key, icon: Icon, color, iconBg }) => (
        <StaggerItem key={key}>
          <div
            className={`bg-white/60 border ${color} rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200`}
          >
            <div className={`w-12 h-12 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className="w-6 h-6" />
            </div>
            <h4 className="text-nasun-black font-semibold text-lg mb-2">
              {t(`executor.cards.${key}.title`)}
            </h4>
            <p className="text-nasun-black/50 text-sm leading-relaxed">
              {t(`executor.cards.${key}.description`)}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
