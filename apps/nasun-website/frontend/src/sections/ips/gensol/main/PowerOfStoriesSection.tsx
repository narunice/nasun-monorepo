import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import SectionTitle from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";

// 배경 이미지
import bgImage from "@/assets/images/boliviainteligente-iVgqztKXxwM-unsplash.jpg";

function PowerOfStoriesSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="!px-8 sm:!px-10 md:!px-12  overflow-hidden bg-nasun-black min-h-[80vh]">
      {/* 배경 이미지 - 섹션 전체 커버 */}
      <div className="absolute inset-0 z-0">
        <img src={bgImage} alt="Background" className="w-full h-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(to bottom, #191615 0%, transparent 50%),
              radial-gradient(ellipse 115% 100% at 100% 100%, transparent 0%, transparent 10%, #191615 85%)
            `,
          }}
        />
      </div>

      {/* 콘텐츠 */}
      <div className="relative z-10 w-full max-w-5xl mx-auto ">
        <OuterBox color="n1" className="w-full bg-nasun-c6/50 mt-20 mb-28">
          <FadeInUp>
            {/* 섹션 타이틀 */}
            <SectionTitle as="h3" className="!font-rubik text-center uppercase mb-8 md:mb-10 ">
              {t("powerOfStories.title")}
            </SectionTitle>

            {/* 문단들 - 세련된 타이포그래피 */}
            <div className="space-y-4 md:space-y-6 ">
              <p>{t("powerOfStories.paragraph1")}</p>
              <p>{t("powerOfStories.paragraph2")}</p>
              <p>{t("powerOfStories.paragraph3")}</p>
            </div>
          </FadeInUp>
        </OuterBox>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PowerOfStoriesSection);
