import React from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  Wallet,
  Lock,
  Shuffle,
  Cpu,
  Coins,
  ClipboardCheck,
  MessageSquare,
  ArrowRight,
  ArrowDown,
} from "lucide-react";
import type { ComponentType } from "react";
import { StaggerContainer, StaggerItem } from "../../baram/animations";

const steps: {
  key: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { key: "register", icon: Users, color: "bg-blue-50 text-blue-600" },
  { key: "budget", icon: Wallet, color: "bg-purple-50 text-purple-600" },
  { key: "request", icon: Lock, color: "bg-cyan-50 text-cyan-600" },
  { key: "assign", icon: Shuffle, color: "bg-teal-50 text-teal-600" },
  { key: "execute", icon: Cpu, color: "bg-green-50 text-green-600" },
  { key: "settle", icon: Coins, color: "bg-orange-50 text-orange-600" },
  { key: "receive", icon: ClipboardCheck, color: "bg-nasun-c4/10 text-nasun-c4" },
  { key: "dashboard", icon: MessageSquare, color: "bg-rose-50 text-rose-600" },
];

export { steps as flowSteps };

export function ExecutionFlowDiagram() {
  const { t } = useTranslation("baram-aer");

  return (
    <StaggerContainer className="flex flex-col lg:flex-row items-stretch gap-3 lg:gap-2 w-full">
      {steps.map(({ key, icon: Icon, color }, i) => (
        <React.Fragment key={key}>
          <StaggerItem className="flex-1 w-full lg:w-0">
            <div className="h-full bg-white/60 border border-nasun-c4/15 hover:border-nasun-c4/30 rounded-xl p-4 lg:p-3 text-center shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
              <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mx-auto mb-2`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <p className="text-nasun-black font-medium text-xs">
                {t(`flow.steps.${key}.title`)}
              </p>
              <p className="text-nasun-black/35 text-[10px] mt-0.5">
                {t(`flow.steps.${key}.subtitle`)}
              </p>
            </div>
          </StaggerItem>
          {i < steps.length - 1 && (
            <div className="flex items-center justify-center flex-shrink-0">
              <ArrowRight className="hidden lg:block w-3 h-3 text-nasun-c4/30" />
              <ArrowDown className="lg:hidden w-3 h-3 text-nasun-c4/30" />
            </div>
          )}
        </React.Fragment>
      ))}
    </StaggerContainer>
  );
}
