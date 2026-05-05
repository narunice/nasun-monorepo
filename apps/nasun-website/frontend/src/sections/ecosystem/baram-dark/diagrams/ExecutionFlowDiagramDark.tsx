import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
import type { TFunction } from "i18next";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";
import { flowStepsDark } from "./flowSteps";

function FlowCard({
  step,
  t,
}: {
  step: (typeof flowStepsDark)[number];
  t: TFunction;
}) {
  const { key, icon: Icon, color } = step;
  return (
    <OuterBox
      color="br2"
      padding="sm"
      className="h-full text-center hover:-translate-y-1 transition-all duration-200 !py-4 !px-4 !bg-br-2/20"
    >
      <div className="flex items-center justify-center mb-2">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-nasun-white font-semibold text-sm">{t(`flow.steps.${key}.title`)}</p>
      <p className="text-nasun-white/60 text-xs mt-0.5">{t(`flow.steps.${key}.subtitle`)}</p>
    </OuterBox>
  );
}

function FlowRow({ items, t }: { items: typeof flowStepsDark; t: TFunction }) {
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
  const row1 = flowStepsDark.slice(0, 4);
  const row2 = flowStepsDark.slice(4);

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
        {flowStepsDark.map((step, i) => (
          <React.Fragment key={step.key}>
            <StaggerItem>
              <FlowCard step={step} t={t} />
            </StaggerItem>
            {i < flowStepsDark.length - 1 && (
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
