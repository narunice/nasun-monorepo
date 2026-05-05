import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { Shield, Lock, Coins, ClipboardCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

const pillars = [
  {
    key: "hardware" as const,
    icon: Shield,
    iconStyle: {
      background: "linear-gradient(145deg, #b2e2b1, #8fbf85)",
      boxShadow: "0 4px 14px rgba(94,158,92,0.25)",
    } satisfies CSSProperties,
  },
  {
    key: "escrow" as const,
    icon: Lock,
    iconStyle: {
      background: "linear-gradient(145deg, #70b896, #5a9e7d)",
      boxShadow: "0 4px 14px rgba(90,158,125,0.2)",
    } satisfies CSSProperties,
  },
  {
    key: "stake" as const,
    icon: Coins,
    iconStyle: {
      background: "linear-gradient(145deg, #9a8dc8, #8a7db8)",
      boxShadow: "0 4px 14px rgba(138,125,184,0.2)",
    } satisfies CSSProperties,
  },
  {
    key: "compliance" as const,
    icon: ClipboardCheck,
    iconStyle: {
      background: "linear-gradient(145deg, #6a9fc0, #5a8fad)",
      boxShadow: "0 4px 14px rgba(90,143,173,0.2)",
    } satisfies CSSProperties,
  },
];

export function TrustPillarsDiagramDark() {
  const { t } = useTranslation("baram");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {pillars.map(({ key, icon: Icon, iconStyle }) => (
        <StaggerItem key={key} className="h-full">
          <OuterBox
            color="noborder"
            padding="sm"
            className="h-full hover:-translate-y-1 transition-all duration-200 bg-br-5"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4 ring-1 ring-white/10"
              style={iconStyle}
            >
              <Icon className="w-7 h-7 text-white" />
            </div>
            <h6 className="font-semibold text-nasun-black mb-1">{t(`trust.pillars.${key}.title`)}</h6>
            <p className="text-sm text-nasun-black/80 leading-relaxed">
              {t(`trust.pillars.${key}.description`)}
            </p>
          </OuterBox>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
