import { useTranslation } from "react-i18next";
import { Star, Coins, Award, Eye } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

const cards = [
  { key: "reputation" as const, icon: Star, iconBg: "bg-nasun-br-2d/20 text-nasun-br-2" },
  { key: "staking" as const, icon: Coins, iconBg: "bg-nasun-br-1d/20 text-nasun-br-1" },
  { key: "tiers" as const, icon: Award, iconBg: "bg-nasun-br-3d/20 text-nasun-br-3" },
  { key: "tee" as const, icon: Eye, iconBg: "bg-nasun-br-4d/20 text-nasun-br-4" },
];

export function ExecutorOverviewDiagramDark() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {cards.map(({ key, icon: Icon, iconBg }) => (
        <StaggerItem key={key} className="h-full">
          <OuterBox
            color="noborder"
            padding="sm"
            className="h-full hover:-translate-y-1 transition-all duration-200"
          >
            <div className={`w-12 h-12 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className="w-6 h-6" />
            </div>
            <h6 className="font-semibold text-nasun-white mb-2">
              {t(`executor.cards.${key}.title`)}
            </h6>
            <p className="text-sm text-nasun-white/70 leading-relaxed">
              {t(`executor.cards.${key}.description`)}
            </p>
          </OuterBox>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
