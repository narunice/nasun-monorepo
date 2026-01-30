import { useTranslation } from "react-i18next";
import { Server, Coins, Award, Shuffle } from "lucide-react";

const cards = [
  { key: "teeWorkers" as const, icon: Server, color: "border-cyan-400/20", iconBg: "bg-cyan-50 text-cyan-600" },
  { key: "stakeEarn" as const, icon: Coins, color: "border-teal-400/20", iconBg: "bg-teal-50 text-teal-600" },
  { key: "tierSystem" as const, icon: Award, color: "border-cyan-400/20", iconBg: "bg-cyan-50 text-cyan-600" },
  { key: "autoSelection" as const, icon: Shuffle, color: "border-teal-400/20", iconBg: "bg-teal-50 text-teal-600" },
];

export function ExecutorDiagram() {
  const { t } = useTranslation("baram");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {cards.map(({ key, icon: Icon, color, iconBg }) => (
        <div
          key={key}
          className={`bg-nasun-c4/[0.03] border ${color} rounded-xl p-6 shadow-sm`}
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
      ))}
    </div>
  );
}
