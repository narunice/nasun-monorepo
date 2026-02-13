import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";

interface TokenUseCase {
  key: "staking" | "fee" | "transfer" | "governance";
  color: "c4";
  gradient: string;
  titleClassName: string;
}

const tokenUses: TokenUseCase[] = [
  {
    key: "staking",
    color: "c4",
    gradient: "",
    titleClassName: "!text-[#B3E0FF] !font-bold !",
  },
  {
    key: "fee",
    color: "c4",
    gradient: "",
    titleClassName: "!text-[#B3E0FF] !font-bold ",
  },
  {
    key: "transfer",
    color: "c4",
    gradient: "",
    titleClassName: "!text-[#B3E0FF] !font-bold ",
  },
  {
    key: "governance",
    color: "c4",
    gradient: "",
    titleClassName: "!text-[#B3E0FF] !font-bold ",
  },
];

function NasunTokenSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[410px_1fr] xl:grid-cols-[430px_1fr] gap-x-8 py-10 lg:py-12 xl:py-14">
          {/* Left: Title Section */}
          <div className="flex flex-col items-center lg:items-end text-center lg:text-right">
            <h1 className="font-medium text-nasun-white/90 max-w-[410px] md:max-w-lg lg:max-w-none leading-[1.1]">
              NSN Token
              <br />
              Four Main <br />
              Use Cases
            </h1>
            <div className="flex flex-col items-center lg:items-end justify-center text-center lg:text-right h-[180px] w-full">
              <h4 className="font-medium w-full text-[#B3E0FF] whitespace-pre-line py-4 lg:py-2 leading-tight">
                {t("token.subtitle")}
              </h4>
            </div>
          </div>

          {/* Right: Use Cases Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {tokenUses.map((use) => (
              <DividerBox
                padding="sm"
                key={use.key}
                title={t(`token.uses.${use.key}.heading`)}
                color={use.color}
                titleClassName={use.titleClassName}
                description={t(`token.uses.${use.key}.description`)}
                descriptionClassName="!mb-0"
                hideDivider
                className={`${use.gradient} !bg-nasun-c4/90 min-h-[160px] !border-nasun-white/50 xl:min-h-[192px] flex flex-col justify-center !py-6 md:!py-8`}
              />
            ))}
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NasunTokenSection);
