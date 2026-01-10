import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { DividerBox } from "../../../ui/DividerBox";

interface TokenUseCase {
  key: "staking" | "fee" | "transfer" | "governance";
  color: "c1" | "c2" | "c3" | "c4" | "coral";
  gradient: string;
  titleClassName: string;
}

const tokenUses: TokenUseCase[] = [
  {
    key: "staking",
    color: "n1",
    gradient: "!bg-gradient-to-r from-nasun-c2/10 to-nasun-c1/10",
    titleClassName: "!text-nasun-c1",
  },
  {
    key: "fee",
    color: "n1",
    gradient: "!bg-gradient-to-r from-nasun-c1/10 to-nasun-c2/10",
    titleClassName: "!text-nasun-c1",
  },
  {
    key: "transfer",
    color: "n1",
    gradient: "!bg-gradient-to-r from-nasun-c2/10 to-nasun-c1/10",
    titleClassName: "!text-nasun-c1",
  },
  {
    key: "governance",
    color: "n1",
    gradient: "!bg-gradient-to-r from-nasun-c1/10 to-nasun-c2/10",
    titleClassName: "!text-nasun-c1",
  },
];

function NasunTokenSection() {
  const { t } = useTranslation("tokenomics");

  // 지그재그 레이아웃 (원본과 동일)
  const getStaggerClass = (index: number) => {
    // 모바일: 짝수(0,2) 우측마진, 홀수(1,3) 좌측마진
    const mobileClass = index % 2 === 0 ? "mr-12 xl:mr-12" : "ml-12 xl:ml-12";

    // 데스크톱: 각 카드별 개별 오프셋
    const desktopClasses = [
      "xl:ml-10 xl:-translate-y-5", // 0번
      "xl:mr-10 xl:translate-y-5", // 1번
      "xl:ml-10 xl:-translate-y-5", // 2번
      "xl:mr-10 xl:translate-y-5", // 3번
    ];

    return `${mobileClass} ${desktopClasses[index] || ""}`;
  };

  return (
    <SectionLayout className="">
      <div className="max-w-7xl mx-auto pr-12">
        <div className="grid lg:grid-cols-[410px_1fr] xl:grid-cols-[430px_1fr] gap-x-8 py-10 lg:py-12 xl:py-14">
          {/* Left: Title Section (기존과 동일) */}
          <div className="flex flex-col items-center lg:items-end text-center lg:text-right">
            <h1 className="font-semibold max-w-[410px] md:max-w-lg lg:max-w-none leading-[1.1]">
              NSN Token
              <br />
              Four Main <br />
              Use Cases
            </h1>
            <div className="flex flex-col items-center lg:items-end justify-center text-center lg:text-right h-[180px] w-full">
              <h4 className="font-medium w-full text-nasun-c3/90 whitespace-pre-line py-4 lg:py-2 leading-tight">
                {t("token.subtitle")}
              </h4>
            </div>
          </div>

          {/* Right: Use Cases Cards - DividerBox 사용 (원본 레이아웃) */}
          <div className="space-y-6 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-x-4 xl:gap-y-10 xl:items-start xl:-mr-0">
            {tokenUses.map((use, index) => (
              <DividerBox
                key={use.key}
                title={t(`token.uses.${use.key}.heading`)}
                color={use.color}
                titleClassName={use.titleClassName}
                description={t(`token.uses.${use.key}.description`)}
                descriptionClassName="!mb-0"
                className={` ${
                  use.gradient
                } transition-all hover:shadow-lg min-h-[160px] xl:min-h-[192px] ${getStaggerClass(
                  index
                )}`}
              />
            ))}
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NasunTokenSection);
