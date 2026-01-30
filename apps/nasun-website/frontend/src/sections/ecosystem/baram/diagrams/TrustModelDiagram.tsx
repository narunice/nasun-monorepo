import { useTranslation } from "react-i18next";
import { Shield, Lock, Coins, ClipboardCheck } from "lucide-react";

const pillars = [
  { key: "hardware" as const, icon: Shield, color: "border-green-400/20", iconBg: "bg-green-50 text-green-600" },
  { key: "escrow" as const, icon: Lock, color: "border-orange-400/20", iconBg: "bg-orange-50 text-orange-600" },
  { key: "stake" as const, icon: Coins, color: "border-purple-400/20", iconBg: "bg-purple-50 text-purple-600" },
  { key: "compliance" as const, icon: ClipboardCheck, color: "border-nasun-c4/20", iconBg: "bg-nasun-c4/10 text-nasun-c4" },
];

export function TrustModelDiagram() {
  const { t } = useTranslation("baram");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {pillars.map(({ key, icon: Icon, color, iconBg }) => (
        <div
          key={key}
          className={`bg-nasun-c4/[0.03] border ${color} rounded-xl p-6 shadow-sm`}
        >
          <div className={`w-12 h-12 rounded-lg ${iconBg} flex items-center justify-center mb-4`}>
            <Icon className="w-6 h-6" />
          </div>
          <h4 className="text-nasun-black font-semibold text-lg mb-2">
            {t(`trust.pillars.${key}.title`)}
          </h4>
          <p className="text-nasun-black/50 text-sm leading-relaxed">
            {t(`trust.pillars.${key}.description`)}
          </p>
        </div>
      ))}
    </div>
  );
}
