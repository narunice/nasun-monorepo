import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { OuterBox } from "../../../ui/OuterBox";
import { Button } from "../../../ui/button";
import { Map, Compass } from "lucide-react";

interface PipelineStep {
  number: number;
  title: string;
  description: string;
}

export const StrategyExecutionSection = () => {
  const { t } = useTranslation("strategy");

  // Pipeline
  const steps = t("pipeline.steps", { returnObjects: true }) as PipelineStep[];

  // TheWay
  const items = t("theWay.items", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="">
      <div className="max-w-5xl mx-auto">
        {/* ========== 1. Pipeline Section ========== */}
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("pipeline.title")}
        </SectionTitle>

        <p className="text-nasun-white/85 text-base md:text-lg leading-relaxed mb-6 md:mb-8">
          {t("pipeline.intro")}
        </p>

        <div className="space-y-4 md:space-y-6 mb-6 md:mb-8">
          {steps.map((step) => (
            <OuterBox key={step.number} variant="c4" className="h-full">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-nasun-c4 text-nasun-black font-bold text-lg flex items-center justify-center">
                  {step.number}
                </div>
                <div className="flex-1">
                  <h4 className="text-nasun-c4 font-semibold text-lg mb-2">{step.title}</h4>
                  <p className="text-nasun-white/85 text-sm md:text-base">{step.description}</p>
                </div>
              </div>
            </OuterBox>
          ))}
        </div>

        <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed mb-16 md:mb-20">
          {t("pipeline.conclusion")}
        </p>

        {/* ========== 2. TheWay Section ========== */}
        <div className="flex items-center gap-3 mb-2 md:mb-3 lg:mb-4">
          <Compass className="w-6 h-6 text-nasun-white" />
          <SectionTitle as="h3" className="!mb-0">
            {t("theWay.title")}
          </SectionTitle>
        </div>

        <p className="text-nasun-white/85 text-base md:text-lg leading-relaxed mb-6 md:mb-8">
          {t("theWay.intro")}
        </p>

        <OuterBox variant="white" className="mb-6 md:mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {/* Left Column: Items 1-6 */}
            <ul className="flex flex-col gap-4">
              {items.slice(0, 6).map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-nasun-white/85">
                  <span className="text-nasun-white font-bold text-lg mt-0.5 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <span className="text-sm md:text-base">
                    {item.includes(" — ") ? (
                      <>
                        <span className="font-medium">{item.split(" — ")[0]}</span>
                        {" — "}
                        {item.split(" — ").slice(1).join(" — ")}
                      </>
                    ) : (
                      item
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {/* Right Column: Items 7-11 */}
            <ul className="flex flex-col gap-4 mt-4 md:mt-0">
              {items.slice(6).map((item, index) => (
                <li key={index + 6} className="flex items-start gap-3 text-nasun-white/85">
                  <span className="text-nasun-white font-bold text-lg mt-0.5 flex-shrink-0">
                    {index + 7}.
                  </span>
                  <span className="text-sm md:text-base">
                    {item.includes(" — ") ? (
                      <>
                        <span className="font-medium">{item.split(" — ")[0]}</span>
                        {" — "}
                        {item.split(" — ").slice(1).join(" — ")}
                      </>
                    ) : (
                      item
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </OuterBox>

        <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed italic mb-6 md:mb-8">
          {t("theWay.closing")}
        </p>

        {/* CTA Button */}
        <div className="flex justify-center">
          <Button variant="c3" size="lg" asChild>
            <Link to="/vision/roadmap">
              <Map className="w-4 h-4 mr-2" />
              {t("theWay.buttons.roadmap")}
            </Link>
          </Button>
        </div>
      </div>
    </SectionLayout>
  );
};

export default StrategyExecutionSection;
