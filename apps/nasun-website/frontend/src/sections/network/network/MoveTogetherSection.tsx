import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import fastIcon from "../../../assets/images/fast.svg";
import scalableIcon from "../../../assets/images/scalable.svg";
import secureIcon from "../../../assets/images/secure.svg";
import resourceIcon from "../../../assets/images/resource.svg";

type TitleKey =
  | "moveTogether.keyword1.title"
  | "moveTogether.keyword2.title"
  | "moveTogether.keyword3.title"
  | "moveTogether.keyword4.title";

type DescKey =
  | "moveTogether.keyword1.description"
  | "moveTogether.keyword2.description"
  | "moveTogether.keyword3.description"
  | "moveTogether.keyword4.description";

interface AdvantageItem {
  key: string;
  titleKey: TitleKey;
  descKey: DescKey;
  icon: string;
}

const advantages: AdvantageItem[] = [
  {
    key: "fast",
    titleKey: "moveTogether.keyword1.title",
    descKey: "moveTogether.keyword1.description",
    icon: fastIcon,
  },
  {
    key: "scalable",
    titleKey: "moveTogether.keyword2.title",
    descKey: "moveTogether.keyword2.description",
    icon: scalableIcon,
  },
  {
    key: "secure",
    titleKey: "moveTogether.keyword3.title",
    descKey: "moveTogether.keyword3.description",
    icon: secureIcon,
  },
  {
    key: "resource",
    titleKey: "moveTogether.keyword4.title",
    descKey: "moveTogether.keyword4.description",
    icon: resourceIcon,
  },
];

function MoveTogetherSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="!max-w-6xl">
      {/* Main Title */}
      <SectionTitle
        as="h2"
        className="font-medium uppercase text-center my-2 md:my-3 lg:my-4 xl:my-5"
      >
        {t("moveTogether.heading")}
      </SectionTitle>

      {/* Subtitle with highlight */}
      <div className="mb-3 md:mb-4 lg:mb-5 xl:mb-6 flex flex-col items-center">
        <h4 className="text-nasun-c3/90 font-semibold text-center">{t("moveTogether.subtitle")}</h4>
      </div>

      {/* Description */}
      <p className="text-left text-nasun-white/80 mb-10 max-w-4xl mx-auto whitespace-pre-line">
        {t("moveTogether.description")}
      </p>
      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8">
        {advantages.map((item) => (
          <div
            key={item.key}
            className="border border-nasun-c3/50 rounded-2xl bg-[#1d2d2a] backdrop-blur-md p-6 md:p-8 transition-all hover:border-nasun-c3/80 hover:bg-nasun-c3/15 min-h-[140px] md:min-h-[160px]"
          >
            <div className="flex items-center gap-6 h-full">
              {/* Icon Box */}
              <div className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-xl bg-nasun-c2/20 border-3 border-nasun-c3 flex items-center justify-center">
                <img
                  src={item.icon}
                  alt={t(item.titleKey)}
                  className="w-8 h-8 md:w-10 md:h-10 object-contain"
                  style={{
                    filter:
                      "invert(89%) sepia(14%) saturate(575%) hue-rotate(116deg) brightness(96%) contrast(91%)",
                  }}
                />
              </div>

              {/* Text Content */}
              <div className="flex-1">
                <h4 className="font-semibold text-nasun-c3 mb-2">{t(item.titleKey)}</h4>
                <p className="text-nasun-white/80">{t(item.descKey)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionLayout>
  );
}

export default React.memo(MoveTogetherSection);
