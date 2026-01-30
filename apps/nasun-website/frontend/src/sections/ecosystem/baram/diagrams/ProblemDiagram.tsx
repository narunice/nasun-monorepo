import { useTranslation } from "react-i18next";
import { EyeOff, Ban, FileQuestion } from "lucide-react";

const cards = [
  { key: "privacy" as const, icon: EyeOff, color: "border-red-400/20" },
  { key: "payment" as const, icon: Ban, color: "border-orange-400/20" },
  { key: "audit" as const, icon: FileQuestion, color: "border-yellow-400/20" },
];

export function ProblemDiagram() {
  const { t } = useTranslation("baram");

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map(({ key, icon: Icon, color }) => (
        <div
          key={key}
          className={`bg-nasun-c4/[0.03] border ${color} rounded-xl p-6 flex flex-col items-center text-center shadow-sm`}
        >
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <Icon className="w-6 h-6 text-red-500" />
          </div>
          <h4 className="text-nasun-black font-semibold text-lg mb-2">
            {t(`problem.cards.${key}.title`)}
          </h4>
          <p className="text-nasun-black/50 text-sm">
            {t(`problem.cards.${key}.description`)}
          </p>
        </div>
      ))}
    </div>
  );
}
