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
import { useTranslation } from "react-i18next";
import type { EventStep } from "../../../types/battalion-nft";

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
  const { t } = useTranslation("battalion-nft");

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
        return "bg-teal-800 text-white border-teal-600";
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
                        ${status === "current" ? "ring-4 ring-teal-600/20" : ""}
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
                        ${status === "current" ? "text-teal-500" : ""}
                        ${status === "completed" ? "text-nasun-nw1" : ""}
                        ${status === "upcoming" ? "text-gray-400" : ""}
                      `}
                    >
                      {t(`stepper.step${step}`)}
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

      {/* Mobile View */}
      <div className="md:hidden px-[8%]">
        <div className="space-y-4">
          {steps.map((step) => {
            const status = getStepStatus(step);
            const stepColor = getStepColor(status);

            return (
              <div key={step} className="flex items-center justify-between gap-3">
                {/* Left: Step Circle + Label */}
                <div className="flex items-center gap-3">
                  {/* Step Circle */}
                  <div
                    className={`
                      w-10 h-10 rounded-full border-2 flex items-center justify-center
                      font-semibold flex-shrink-0 transition-all
                      ${stepColor}
                      ${status === "current" ? "ring-4 ring-teal-600/20" : ""}
                    `}
                  >
                    {status === "completed" ? (
                      <svg
                        className="w-5 h-5"
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

                  {/* Step Label */}
                  <p
                    className={`
                      ${status === "current" ? "text-teal-400" : ""}
                      ${status === "completed" ? "text-nasun-nw1" : ""}
                      ${status === "upcoming" ? "text-gray-400" : ""}
                    `}
                  >
                    {t(`stepper.step${step}`)}
                  </p>
                </div>

                {/* Right: Status Badge */}
                {status === "current" && (
                  <span className="px-3 py-1 text-teal-400 bg-teal-700/30 rounded-full text-sm flex-shrink-0">
                    {t("stepper.statusCurrent")}
                  </span>
                )}
                {status === "completed" && (
                  <span className="px-3 py-1 text-nasun-nw1 bg-nasun-nw1/20 rounded-full text-sm flex-shrink-0">
                    {t("stepper.statusCompleted")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
