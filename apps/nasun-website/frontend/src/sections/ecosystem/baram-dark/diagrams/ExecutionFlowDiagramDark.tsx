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
  ChevronRight,
  ChevronLeft,
  ChevronDown,
} from "lucide-react";
import type { ComponentType } from "react";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

type FlowStepKey =
  | "register"
  | "budget"
  | "request"
  | "assign"
  | "execute"
  | "settle"
  | "receive"
  | "dashboard";

const steps: {
  key: FlowStepKey;
  icon: ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { key: "register", icon: Users, color: "bg-nasun-br-2d/25 text-br-2t" },
  { key: "budget", icon: Wallet, color: "bg-nasun-br-3d/25 text-br-3t" },
  { key: "request", icon: Lock, color: "bg-nasun-br-2d/25 text-br-2t" },
  { key: "assign", icon: Shuffle, color: "bg-nasun-br-1d/25 text-br-1t" },
  { key: "execute", icon: Cpu, color: "bg-nasun-br-4d/25 text-br-4t" },
  { key: "settle", icon: Coins, color: "bg-nasun-br-1d/25 text-br-1t" },
  { key: "receive", icon: ClipboardCheck, color: "bg-nasun-br-1d/25 text-br-1t" },
  { key: "dashboard", icon: MessageSquare, color: "bg-nasun-br-3d/25 text-br-3t" },
];

export { steps as flowStepsDark };

function FlowCard({
  step,
  t,
}: {
  step: (typeof steps)[number];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const { key, icon: Icon, color } = step;
  return (
    <OuterBox
      color="noborder"
      padding="sm"
      className="h-full text-center hover:-translate-y-1 transition-all duration-200 !py-4 !px-4 bg-br-2"
    >
      <div className="flex items-center justify-center mb-2">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-nasun-black font-semibold text-sm">{t(`flow.steps.${key}.title`)}</p>
      <p className="text-nasun-black/60 text-xs mt-0.5">{t(`flow.steps.${key}.subtitle`)}</p>
    </OuterBox>
  );
}

function FlowRow({ items, t }: { items: typeof steps; t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <div className="flex items-stretch gap-1">
      {items.map((step, i) => (
        <React.Fragment key={step.key}>
          <StaggerItem className="flex-1">
            <FlowCard step={step} t={t} />
          </StaggerItem>
          {i < items.length - 1 && (
            <div className="flex items-center justify-center flex-shrink-0 px-1">
              <ChevronRight className="w-5 h-5 text-nasun-white/60" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function ExecutionFlowDiagramDark() {
  const { t } = useTranslation("baram");
  const row1 = steps.slice(0, 4);
  const row2 = steps.slice(4);

  return (
    <StaggerContainer>
      {/* Desktop: 2 rows of 4, snake pattern */}
      <div className="hidden lg:flex flex-col gap-1">
        {/* Row 1: left → right (01 → 02 → 03 → 04) */}
        <FlowRow items={row1} t={t} />

        {/* Down arrow aligned with card 04 (right side) */}
        <div className="flex justify-end pr-[11%]">
          <ChevronDown className="w-5 h-5 text-nasun-white/60" />
        </div>

        {/* Row 2: right → left (05 → 06 → 07 → 08), reversed display */}
        <div className="flex items-stretch gap-1">
          {[...row2].reverse().map((step, i, arr) => (
            <React.Fragment key={step.key}>
              <StaggerItem className="flex-1">
                <FlowCard step={step} t={t} />
              </StaggerItem>
              {i < arr.length - 1 && (
                <div className="flex items-center justify-center flex-shrink-0 px-1">
                  <ChevronLeft className="w-5 h-5 text-nasun-white/60" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Mobile: vertical stack */}
      <div className="flex lg:hidden flex-col items-stretch gap-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.key}>
            <StaggerItem>
              <FlowCard step={step} t={t} />
            </StaggerItem>
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center">
                <ChevronDown className="w-4 h-4 text-nasun-white/50" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </StaggerContainer>
  );
}
