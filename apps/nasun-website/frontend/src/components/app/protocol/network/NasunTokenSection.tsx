import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { DividerBox } from "../../../ui/DividerBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

interface TokenUseCase {
  key: "staking" | "fee" | "transfer" | "governance";
  color: "n2";
  gradient: string;
  titleClassName: string;
}

const tokenUses: TokenUseCase[] = [
  {
    key: "staking",
    color: "n2",
    gradient: "",
    titleClassName: "!text-nasun-c1",
  },
  {
    key: "fee",
    color: "n2",
    gradient: "",
    titleClassName: "!text-nasun-c1",
  },
  {
    key: "transfer",
    color: "n2",
    gradient: "",
    titleClassName: "!text-nasun-c1",
  },
  {
    key: "governance",
    color: "n2",
    gradient: "",
    titleClassName: "!text-nasun-c1",
  },
];

function NasunTokenSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="">
      <div className="max-w-7xl mx-auto">
        <FadeInUp>
          <div className="grid lg:grid-cols-[410px_1fr] xl:grid-cols-[430px_1fr] gap-x-8 py-10 lg:py-12 xl:py-14">
            {/* Left: Title Section */}
            <div className="flex flex-col items-center lg:items-end text-center lg:text-right">
              <h1 className="font-semibold max-w-[410px] md:max-w-lg lg:max-w-none leading-[1.1]">
                NSN Token
                <br />
                Four Main <br />
                Use Cases
              </h1>
              <div className="flex flex-col items-center lg:items-end justify-center text-center lg:text-right h-[180px] w-full">
                <h4 className="font-medium w-full text-nasun-c4 whitespace-pre-line py-4 lg:py-2 leading-tight">
                  {t("token.subtitle")}
                </h4>
              </div>
            </div>

            {/* Right: Use Cases Cards */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {tokenUses.map((use) => (
                <DividerBox
                  key={use.key}
                  title={t(`token.uses.${use.key}.heading`)}
                  color={use.color}
                  titleClassName={use.titleClassName}
                  description={t(`token.uses.${use.key}.description`)}
                  descriptionClassName="!mb-0"
                  className={`${use.gradient} transition-all hover:bg-nasun-c3/15 min-h-[160px] xl:min-h-[192px]`}
                />
              ))}
            </div>
          </div>
        </FadeInUp>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NasunTokenSection);
