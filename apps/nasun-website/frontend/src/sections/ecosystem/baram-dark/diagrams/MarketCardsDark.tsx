import { useTranslation } from "react-i18next";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

const regulations = [
  { key: "korea" as const },
  { key: "eu" as const },
  { key: "gap" as const },
];

export function MarketCardsDark() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {regulations.map(({ key }) => (
        <StaggerItem key={key} className="h-full">
          <OuterBox color="noborder" padding="sm" className="h-full hover:shadow-md transition-all duration-200">
            <p className="text-nasun-br-1/70 font-mono text-xs uppercase tracking-wider mb-2">
              {t(`market.regulations.${key}Date`)}
            </p>
            <h6 className="font-semibold text-nasun-white mb-2">
              {t(`market.regulations.${key}Title`)}
            </h6>
            <p className="text-nasun-white/70">
              {t(`market.regulations.${key}Detail`)}
            </p>
          </OuterBox>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
