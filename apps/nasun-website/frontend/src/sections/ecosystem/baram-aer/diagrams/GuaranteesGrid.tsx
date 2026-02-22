import { useTranslation } from "react-i18next";
import { Shield, Cpu, Coins, GitBranch } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../../baram/animations";

const cards = [
  { key: "authorization" as const, Icon: Shield, color: "border-blue-300/30 hover:border-blue-300/50", iconBg: "bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600" },
  { key: "execution" as const, Icon: Cpu, color: "border-green-300/30 hover:border-green-300/50", iconBg: "bg-gradient-to-br from-green-50 to-emerald-50 text-green-600" },
  { key: "settlement" as const, Icon: Coins, color: "border-orange-300/30 hover:border-orange-300/50", iconBg: "bg-gradient-to-br from-orange-50 to-amber-50 text-orange-600" },
  { key: "lineage" as const, Icon: GitBranch, color: "border-purple-300/30 hover:border-purple-300/50", iconBg: "bg-gradient-to-br from-purple-50 to-violet-50 text-purple-600" },
];

export function GuaranteesGrid() {
  const { t } = useTranslation("baram-aer");

  return (
    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {cards.map(({ key, Icon, color, iconBg }) => (
        <StaggerItem key={key} className="h-full">
          <div className={`h-full bg-white/60 border ${color} rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200`}>
            <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <h6 className="font-semibold mb-1">
              {t(`guarantees.items.${key}.title`)}
            </h6>
            <p className="!text-sm">
              {t(`guarantees.items.${key}.description`)}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
