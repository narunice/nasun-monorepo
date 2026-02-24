import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "../../../layout/SectionLayout";
import { PageTitle } from "../../../ui/PageTitle";
import { DividerBox } from "../../../ui/DividerBox";
import { OuterBox } from "@/components/ui";
import SectionTitle from "@/components/ui/SectionTitle";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCoins,
  faGift,
  faImage,
  faListCheck,
  faDice,
  faTag,
  faBullhorn,
} from "@fortawesome/free-solid-svg-icons";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "../../../ui/button-variants";

const TARGET_ACCOUNT = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
const FOLLOW_INTENT_URL = `https://twitter.com/intent/follow?screen_name=${TARGET_ACCOUNT}`;

const LeaderboardInfoSection: React.FC = () => {
  const { t } = useTranslation("leaderboard");

  return (
    <SectionLayout className="bg-nasun-black min-h-screen">
      <PageTitle as="h2" align="center" className="">
        {t("info.pageTitle")}
      </PageTitle>

      {/* Introduction Box */}
      <div className="max-w-5xl mx-auto mb-8">
        <OuterBox
          color="n1"
          className="text-center bg-gradient-to-r from-nasun-c5/20 to-nasun-c4/40 border-1 border-nasun-c5  "
        >
          <h4 className="text-nasun-white font-medium ">{t("info.intro.title")}</h4>
          <h5 className="text-nasun-white/75 pt-2">
            {t("info.intro.description")}{" "}
            <a
              href={FOLLOW_INTENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-c3 underline hover:text-sky-200 transition-colors"
            >
              @{TARGET_ACCOUNT}
            </a>
          </h5>
        </OuterBox>
      </div>

      {/* Rewards Breakdown Section */}
      <SectionTitle
        as="h3"
        className="font-medium text-nasun-white text-center py-2 md:py-4 lg:py-6"
      >
        {t("info.rewardsBreakdown")}
      </SectionTitle>

      <div className="flex flex-col gap-4 md:gap-6 lg:gap-8 max-w-3xl mx-auto">
        {/* Platinum Tier - Rank 1-20 */}
        <DividerBox
          color="white"
          title={t("info.tiers.platinum.rank")}
          rightTitle={t("info.tiers.platinum.name")}
          icon={<span>👑</span>}
          titleClassName="text-nasun-white"
          className="!bg-nasun-white/15"
        >
          <ul className="space-y-3 text-nasun-white/90 pl-2 md:pl-4">
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faCoins} className="mt-1 text-nasun-white" />
              <span>{t("info.rewards.topPercentageShare")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faGift} className="mt-1 text-nasun-white" />
              <span>{t("info.rewards.freeMint")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faImage} className="mt-1 text-nasun-white" />
              <span>{t("info.rewards.battalionNft")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faListCheck} className="mt-1 text-nasun-white" />
              <span>{t("info.rewards.allowlistAccess")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faDice} className="mt-1 text-nasun-white" />
              <span>{t("info.rewards.randomDrawings")}</span>
            </li>
          </ul>
        </DividerBox>

        {/* Gold Tier - Rank 21-50 */}
        <DividerBox
          color="c1"
          title={t("info.tiers.gold.rank")}
          rightTitle={t("info.tiers.gold.name")}
          icon={<span>🥇</span>}
          titleClassName="text-nasun-c1"
        >
          <ul className="space-y-3 text-nasun-white/90 pl-2 md:pl-4">
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faCoins} className="mt-1 text-nasun-c1" />
              <span>{t("info.rewards.percentageShare")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faTag} className="mt-1 text-nasun-c1" />
              <span>{t("info.rewards.discountedMint")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faImage} className="mt-1 text-nasun-c1" />
              <span>{t("info.rewards.battalionNft")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faListCheck} className="mt-1 text-nasun-c1" />
              <span>{t("info.rewards.allowlistAccess")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faDice} className="mt-1 text-nasun-c1" />
              <span>{t("info.rewards.randomDrawings")}</span>
            </li>
          </ul>
        </DividerBox>

        {/* Silver Tier - Rank 51-200 */}
        <DividerBox
          color="c2"
          title={t("info.tiers.silver.rank")}
          rightTitle={t("info.tiers.silver.name")}
          icon={<span>🥈</span>}
          titleClassName="text-nasun-c2"
        >
          <ul className="space-y-3 text-nasun-white/90 pl-2 md:pl-4">
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faCoins} className="mt-1 text-nasun-c2" />
              <span>{t("info.rewards.percentageShare")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faImage} className="mt-1 text-nasun-c2" />
              <span>{t("info.rewards.battalionNft")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faListCheck} className="mt-1 text-nasun-c2" />
              <span>{t("info.rewards.allowlistAccess")}</span>
            </li>
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faDice} className="mt-1 text-nasun-c2" />
              <span>{t("info.rewards.randomDrawings")}</span>
            </li>
          </ul>
        </DividerBox>

        {/* Beyond Tier - Rank 201+ */}
        <DividerBox
          color="c3"
          title={t("info.tiers.beyond.rank")}
          rightTitle={t("info.tiers.beyond.name")}
          icon={<span>🏷️</span>}
          titleClassName="text-nasun-c3"
        >
          <ul className="space-y-3 text-nasun-white/90 pl-2 md:pl-4">
            <li className="flex items-start gap-3">
              <FontAwesomeIcon icon={faBullhorn} className="mt-1 text-nasun-c4" />
              <span>{t("info.rewards.beyondRewards")}</span>
            </li>
          </ul>
        </DividerBox>
      </div>

      {/* How to Earn Points Section */}
      <SectionTitle
        as="h3"
        className="font-medium text-nasun-white text-center py-2 md:py-4 lg:py-6 mt-8 md:mt-12"
      >
        {t("info.howToEarnPoints")}
      </SectionTitle>

      <div className="max-w-3xl mx-auto space-y-6">
        <DividerBox
          color="c4"
          title={t("info.engagementScoring.title")}
          titleClassName="text-nasun-c4"
        >
          <p className="text-nasun-white/85">
            {t("info.engagementScoring.description")}{" "}
            <a
              href={FOLLOW_INTENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-c4 underline hover:text-sky-200 transition-colors"
            >
              @{TARGET_ACCOUNT}
            </a>{" "}
            {t("info.engagementScoring.descriptionSuffix")}
          </p>
        </DividerBox>

        <DividerBox
          color="c7"
          title={t("info.rulesGuidelines.title")}
          titleClassName="text-nasun-scarlet"
        >
          <p className="text-nasun-white/85">{t("info.rulesGuidelines.description")}</p>
        </DividerBox>
      </div>

      {/* Go to Leaderboard Button */}
      <div className="flex justify-center mt-10 md:mt-14">
        <Link to="/leaderboard" className={buttonVariants({ variant: "c3", size: "xl" })}>
          {t("info.goToLeaderboard")}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </div>
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
