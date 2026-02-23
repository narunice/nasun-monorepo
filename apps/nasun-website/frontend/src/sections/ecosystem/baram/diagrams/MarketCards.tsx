import { useTranslation } from "react-i18next";
import { StaggerContainer, StaggerItem } from "../animations";

const regulations = [
  { key: "korea" as const, color: "border-blue-300/30 hover:border-blue-300/50" },
  { key: "eu" as const, color: "border-purple-300/30 hover:border-purple-300/50" },
  { key: "gap" as const, color: "border-teal-300/30 hover:border-teal-300/50" },
];

export function MarketCards() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {regulations.map(({ key, color }) => (
        <StaggerItem key={key} className="h-full">
          <div className={`h-full bg-white/60 border ${color} rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200`}>
            <p className="text-nasun-c4/60 font-mono text-[11px] uppercase tracking-wider mb-2">
              {t(`market.regulations.${key}Date`)}
            </p>
            <h6 className="font-semibold mb-2">
              {t(`market.regulations.${key}Title`)}
            </h6>
            <p className="!text-sm">
              {t(`market.regulations.${key}Detail`)}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
