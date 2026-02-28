import { useTranslation } from "react-i18next";
import { EyeOff, Ban, FileQuestion } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

const cards = [
  { key: "ran" as const, icon: EyeOff, iconBg: "bg-red-600/25 text-red-700" },
  { key: "budget" as const, icon: Ban, iconBg: "bg-orange-600/25 text-orange-700" },
  { key: "prove" as const, icon: FileQuestion, iconBg: "bg-amber-600/25 text-amber-800" },
];

export function ProblemCardsDark() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map(({ key, icon: Icon, iconBg }) => (
        <StaggerItem key={key} className="h-full">
          <OuterBox
            color="noborder"
            padding="sm"
            className="h-full flex flex-col items-center text-center hover:-translate-y-1 transition-all duration-200 !bg-br-3"
          >
            <div
              className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center mb-4`}
            >
              <Icon className="w-6 h-6" />
            </div>
            <h6 className="font-semibold text-nasun-black mb-2">
              {t(`problem.questions.${key}.title`)}
            </h6>
            <p className="text-sm text-nasun-black/80">{t(`problem.questions.${key}.detail`)}</p>
          </OuterBox>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
