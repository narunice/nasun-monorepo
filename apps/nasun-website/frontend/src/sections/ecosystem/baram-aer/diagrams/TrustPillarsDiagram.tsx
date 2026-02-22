import { useTranslation } from "react-i18next";
import { Shield, Lock, Coins, ClipboardCheck } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../../baram/animations";

const pillars = [
  { key: "hardware" as const, icon: Shield, color: "border-green-300/30 hover:border-green-300/50", iconBg: "bg-gradient-to-br from-green-50 to-emerald-50 text-green-600" },
  { key: "escrow" as const, icon: Lock, color: "border-orange-300/30 hover:border-orange-300/50", iconBg: "bg-gradient-to-br from-orange-50 to-amber-50 text-orange-600" },
  { key: "stake" as const, icon: Coins, color: "border-purple-300/30 hover:border-purple-300/50", iconBg: "bg-gradient-to-br from-purple-50 to-violet-50 text-purple-600" },
  { key: "compliance" as const, icon: ClipboardCheck, color: "border-nasun-c4/20 hover:border-nasun-c4/40", iconBg: "bg-gradient-to-br from-blue-50 to-cyan-50 text-nasun-c4" },
];

export function TrustPillarsDiagram() {
  const { t } = useTranslation("baram-aer");

  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {pillars.map(({ key, icon: Icon, color, iconBg }) => (
        <StaggerItem key={key} className="h-full">
          <div className={`h-full bg-white/60 border ${color} rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200`}>
            <div className={`w-12 h-12 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className="w-6 h-6" />
            </div>
            <h6 className="font-semibold mb-2">
              {t(`trust.pillars.${key}.title`)}
            </h6>
            <p className="!text-sm leading-relaxed">
              {t(`trust.pillars.${key}.description`)}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
