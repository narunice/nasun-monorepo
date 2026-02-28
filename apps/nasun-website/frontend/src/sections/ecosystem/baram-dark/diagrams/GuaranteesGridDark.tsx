import { useTranslation } from "react-i18next";
import { Shield, Cpu, Coins, GitBranch } from "lucide-react";
import type { CSSProperties } from "react";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

const cards = [
  {
    key: "authorization" as const,
    Icon: Shield,
    containerStyle: {
      background: "linear-gradient(145deg, #70b896, #5a9e7d)",
      boxShadow: "0 4px 14px rgba(90,158,125,0.2)",
    } satisfies CSSProperties,
    iconColor: "text-white",
  },
  {
    key: "execution" as const,
    Icon: Cpu,
    containerStyle: {
      background: "linear-gradient(145deg, #6a9fc0, #5a8fad)",
      boxShadow: "0 4px 14px rgba(90,143,173,0.2)",
    } satisfies CSSProperties,
    iconColor: "text-white",
  },
  {
    key: "settlement" as const,
    Icon: Coins,
    containerStyle: {
      background: "linear-gradient(145deg, #70b86e, #5e9e5c)",
      boxShadow: "0 4px 14px rgba(94,158,92,0.2)",
    } satisfies CSSProperties,
    iconColor: "text-white",
  },
  {
    key: "lineage" as const,
    Icon: GitBranch,
    containerStyle: {
      background: "linear-gradient(145deg, #9a8dc8, #8a7db8)",
      boxShadow: "0 4px 14px rgba(138,125,184,0.2)",
    } satisfies CSSProperties,
    iconColor: "text-white",
  },
];

export function GuaranteesGridDark() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {cards.map(({ key, Icon, containerStyle, iconColor }) => (
        <StaggerItem key={key} className="h-full">
          <OuterBox
            color="noborder"
            padding="sm"
            className="h-full hover:-translate-y-1 transition-all duration-200 bg-br-1"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4 ring-1 ring-white/10"
              style={containerStyle}
            >
              <Icon className={`w-7 h-7 ${iconColor}`} />
            </div>
            <h6 className="font-semibold text-nasun-black mb-1">
              {t(`guarantees.items.${key}.title`)}
            </h6>
            <p className="text-sm text-nasun-black/80">
              {t(`guarantees.items.${key}.description`)}
            </p>
          </OuterBox>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
