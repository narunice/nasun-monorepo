import { useTranslation } from "react-i18next";
import { EyeOff, Ban, FileQuestion } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";

const cards = [
  { key: "privacy" as const, icon: EyeOff, color: "border-red-300/30 hover:border-red-300/50" },
  { key: "payment" as const, icon: Ban, color: "border-orange-300/30 hover:border-orange-300/50" },
  { key: "audit" as const, icon: FileQuestion, color: "border-yellow-300/30 hover:border-yellow-300/50" },
];

export function ProblemDiagram() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map(({ key, icon: Icon, color }) => (
        <StaggerItem key={key}>
          <div
            className={`bg-white/60 border ${color} rounded-xl p-6 flex flex-col items-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200`}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center mb-4">
              <Icon className="w-6 h-6 text-red-500" />
            </div>
            <h4 className="text-nasun-black font-semibold text-lg mb-2">
              {t(`problem.cards.${key}.title`)}
            </h4>
            <p className="text-nasun-black/50 text-sm">
              {t(`problem.cards.${key}.description`)}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
