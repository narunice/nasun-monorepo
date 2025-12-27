import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const ScreenplaySteps = () => {
  const { t } = useTranslation("riderStudio");
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const steps = [
    {
      title: t("riderStudio.screenplay.steps.step1"),
      description: t("riderStudio.screenplay.steps.description1", { returnObjects: true }),
    },
    {
      title: t("riderStudio.screenplay.steps.step2"),
      description: t("riderStudio.screenplay.steps.description2", { returnObjects: true }),
    },
    {
      title: t("riderStudio.screenplay.steps.step3"),
      description: t("riderStudio.screenplay.steps.description3", { returnObjects: true }),
    },
  ];

  return (
    <div className="mx-auto py-4 md:py-5 lg:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`relative p-6 border-1 border-gray-700 rounded-lg transition-all   ${
              hoveredCard === index ? "shadow-lg" : ""
            }`}
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            {/* Animated border */}
            <div
              className={`absolute inset-0 rounded-lg border-1 border-transparent ${
                hoveredCard === index ? "animate-spin-border" : ""
              }`}
            ></div>

            <h4 className="mb-2 lg:mb-3 pl-5">{step.title}</h4>
            <ul className="list-disc pl-5 space-y-1">
              {step.description.map((bullet: string, i: number) => (
                <li className="font-light" key={i}>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(ScreenplaySteps);
