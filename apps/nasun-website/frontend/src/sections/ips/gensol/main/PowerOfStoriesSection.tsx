import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import SectionTitle from "@/components/ui/SectionTitle";

// 배경 이미지
import bgImage from "@/assets/images/boliviainteligente-iVgqztKXxwM-unsplash.jpg";

function PowerOfStoriesSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="!px-8 sm:!px-10 md:!px-12  overflow-hidden bg-nasun-black">
      {/* 배경 이미지 - 섹션 하단에 고정 */}
      <div className="absolute bottom-0 inset-x-0 flex justify-center z-0">
        <div className="relative w-full max-w-[1920px]">
          <img src={bgImage} alt="Background" className="w-full h-auto object-contain" />
          {/* 타원형 오버레이 - 우측 하단 중심, 상단/좌측으로 nasun-black 페이드 */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(to bottom, #191615 0%, transparent 30%),
                radial-gradient(ellipse 120% 100% at 100% 100%, transparent 0%, transparent 10%, #191615 70%)
              `,
            }}
          />
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="relative z-10 w-full max-w-5xl mx-auto ">
        <OuterBox color="n1" className="w-full bg-nasun-c6/50 mt-16 mb-24">
          {/* 섹션 타이틀 */}
          <SectionTitle as="h3" className="!font-rubik text-center uppercase mb-8 md:mb-10 ">
            {t("powerOfStories.title")}
          </SectionTitle>

          {/* 문단들 - 세련된 타이포그래피 */}
          <div className="space-y-4 md:space-y-6 ">
            <p className="">{t("powerOfStories.paragraph1")}</p>

            <p className="">{t("powerOfStories.paragraph2")}</p>

            <p className="">{t("powerOfStories.paragraph4")}</p>

            {/* 강조 문단 */}
            <blockquote className="border-l-4 border-nasun-c1 pl-6 py-2 my-8 font-rubik font-light italic text-nasun-white">
              {t("powerOfStories.paragraph4")}
            </blockquote>
          </div>
        </OuterBox>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PowerOfStoriesSection);
