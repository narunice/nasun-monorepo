/**
 * Stepper Progress Component
 *
 * @description
 * 6단계 NFT Event 진행 상황을 시각적으로 표시하는 Stepper UI
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React from "react";
import type { EventStep } from "../../../types/battalion-nft";

const STEP_LABELS: Record<EventStep, string> = {
  1: "Introduction",
  2: "Connect X",
  3: "Verify Tasks",
  4: "Connect Wallet",
  5: "Register",
  6: "Complete",
};

interface StepperProgressProps {
  currentStep: EventStep;
}

/**
 * Stepper Progress 컴포넌트
 *
 * @features
 * - 현재 Step 강조 표시 (파란색)
 * - 완료된 Step: 체크마크 아이콘 (초록색)
 * - 진행중 Step: 숫자 표시 (파란색)
 * - 미완료 Step: 숫자 표시 (회색)
 * - 반응형 디자인 (모바일/데스크톱)
 */
export const StepperProgress: React.FC<StepperProgressProps> = ({ currentStep }) => {
  const steps: EventStep[] = [1, 2, 3, 4, 5, 6];

  const getStepStatus = (step: EventStep): "completed" | "current" | "upcoming" => {
    if (step < currentStep) return "completed";
    if (step === currentStep) return "current";
    return "upcoming";
  };

  const getStepColor = (status: "completed" | "current" | "upcoming"): string => {
    switch (status) {
      case "completed":
        return "bg-nasun-nw1 text-white border-nasun-nw1";
      case "current":
        return "bg-nasun-sf-blue text-white border-nasun-sf-blue";
      case "upcoming":
        return "bg-gray-700 text-gray-400 border-gray-600";
    }
  };

  const getLineColor = (fromStep: EventStep): string => {
    const status = getStepStatus(fromStep);
    if (status === "completed") {
      return "bg-nasun-nw1";
    }
    return "bg-gray-600";
  };

  return (
    <div className="w-full ">
      {/* Desktop View */}
      <div className="hidden md:block">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-start justify-between">
            {steps.map((step, index) => {
              const status = getStepStatus(step);
              const stepColor = getStepColor(status);

              return (
                <React.Fragment key={step}>
                  {/* Step Unit: Circle + Label */}
                  <div className="flex flex-col items-center gap-2 w-24">
                    {/* Circle */}
                    <div
                      className={`
                        w-12 h-12 rounded-full border-2 flex items-center justify-center
                        font-semibold text-lg transition-all   flex-shrink-0
                        ${stepColor}
                        ${status === "current" ? "ring-4 ring-nasun-sf-blue/20" : ""}
                      `}
                    >
                      {status === "completed" ? (
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        step
                      )}
                    </div>
                    {/* Label */}
                    <p
                      className={`
                        text-center break-words
                        ${status === "current" ? "text-nasun-sf-blue" : ""}
                        ${status === "completed" ? "text-nasun-nw1" : ""}
                        ${status === "upcoming" ? "text-gray-400" : ""}
                      `}
                    >
                      {STEP_LABELS[step]}
                    </p>
                  </div>

                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div className="flex-1 h-1 mt-5 mx-2">
                      <div className={`h-full rounded transition-all   ${getLineColor(step)}`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile View — compact progress */}
      <div className="md:hidden px-[8%]">
        {/* Current step label */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-nasun-sf-blue font-medium">
            {STEP_LABELS[currentStep]}
          </p>
          <p className="text-gray-400">
            {currentStep} / {steps.length}
          </p>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-nasun-sf-blue rounded-full transition-all duration-500"
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
