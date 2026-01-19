import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "../../../layout/SectionLayout";
import { PageTitle } from "../../../ui/PageTitle";
import { DividerBox } from "../../../ui/DividerBox";
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
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { buttonVariants } from "../../../ui/button-variants";

const TARGET_ACCOUNT = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
const FOLLOW_INTENT_URL = `https://twitter.com/intent/follow?screen_name=${TARGET_ACCOUNT}`;

const LeaderboardInfoSection: React.FC = () => {
  const { t } = useTranslation("leaderboard");

  return (
    <SectionLayout className="!max-w-6xl ">
      {/* Page Title */}
      <PageTitle as="h2" align="center">
        {t("info.pageTitle")}
      </PageTitle>
      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Introduction Box */}
        <div className="flex flex-col  text-center mx-auto">
          <h6 className="font-medium">{t("info.intro.title")}</h6>
          <p className="pt-2">
            {t("info.intro.description")}{" "}
            <a
              href={FOLLOW_INTENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-c3 underline underline-offset-4 decoration-nasun-c3/50 hover:text-sky-200 transition-colors"
            >
              @{TARGET_ACCOUNT}
            </a>
          </p>
        </div>

        {/* Rewards Breakdown Section */}
        <section className="space-y-2 md:space-y-3 lg:space-y-4">
          <SectionTitle as="h3" className="font-medium text-nasun-white text-center">
            {t("info.rewardsBreakdown")}
          </SectionTitle>

          <div className="flex flex-col gap-4 md:gap-6 max-w-3xl mx-auto mt-2 md:mt-3 lg:mt-4">
            {/* Platinum Tier - Rank 1-20 */}
            <DividerBox
              color="w1"
              title={t("info.tiers.platinum.rank")}
              rightTitle={t("info.tiers.platinum.name")}
              icon={<span>👑</span>}
              titleClassName="!text-nasun-white"
              className=""
            >
              <ul className="space-y-2 md:space-y-3 text-nasun-white/90 pl-2 md:pl-4">
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faCoins} className="mt-1 w-4 h-4 text-nasun-white" />
                  <span>{t("info.rewards.topPercentageShare")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faGift} className="mt-1 w-4 h-4 text-nasun-white" />
                  <span>{t("info.rewards.freeMint")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faImage} className="mt-1 w-4 h-4 text-nasun-white" />
                  <span>{t("info.rewards.battalionNft")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faListCheck} className="mt-1 w-4 h-4 text-nasun-white" />
                  <span>{t("info.rewards.allowlistAccess")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faDice} className="mt-1 w-4 h-4 text-nasun-white" />
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
              titleClassName="!text-nasun-c1"
            >
              <ul className="space-y-2 md:space-y-3 text-nasun-white/90 pl-2 md:pl-4">
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faCoins} className="mt-1 w-4 h-4 text-nasun-c1" />
                  <span>{t("info.rewards.percentageShare")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faTag} className="mt-1 w-4 h-4 text-nasun-c1" />
                  <span>{t("info.rewards.discountedMint")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faImage} className="mt-1 w-4 h-4 text-nasun-c1" />
                  <span>{t("info.rewards.battalionNft")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faListCheck} className="mt-1 w-4 h-4 text-nasun-c1" />
                  <span>{t("info.rewards.allowlistAccess")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faDice} className="mt-1 w-4 h-4 text-nasun-c1" />
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
              titleClassName="!text-nasun-c2"
            >
              <ul className="space-y-2 md:space-y-3 text-nasun-white/90 pl-2 md:pl-4">
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faCoins} className="mt-1 w-4 h-4 text-nasun-c2" />
                  <span>{t("info.rewards.percentageShare")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faImage} className="mt-1 w-4 h-4 text-nasun-c2" />
                  <span>{t("info.rewards.battalionNft")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faListCheck} className="mt-1 w-4 h-4 text-nasun-c2" />
                  <span>{t("info.rewards.allowlistAccess")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faDice} className="mt-1 w-4 h-4 text-nasun-c2" />
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
              titleClassName="!text-nasun-c3"
            >
              <ul className="space-y-2 md:space-y-3 text-nasun-white/90 pl-2 md:pl-4">
                <li className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faBullhorn} className="mt-1 w-4 h-4 text-nasun-c3" />
                  <span>{t("info.rewards.beyondRewards")}</span>
                </li>
              </ul>
            </DividerBox>
          </div>
        </section>

        {/* How to Earn Points Section */}
        <section className="space-y-2 md:space-y-3 lg:space-y-4">
          <SectionTitle as="h4" className="font-medium text-nasun-white text-center">
            {t("info.howToEarnPoints")}
          </SectionTitle>

          <div className="max-w-3xl mx-auto space-y-4 md:space-y-6 mt-2 md:mt-3 lg:mt-4">
            <DividerBox color="w1" title={t("info.engagementScoring.title")} titleClassName="">
              <p className="text-nasun-white/85 leading-relaxed">
                {t("info.engagementScoring.description")}{" "}
                <a
                  href={FOLLOW_INTENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c1  hover:text-orange-500 transition-colors"
                >
                  @{TARGET_ACCOUNT}
                </a>{" "}
                {t("info.engagementScoring.descriptionSuffix")}
              </p>
            </DividerBox>

            <DividerBox
              color="c5"
              title={t("info.rulesGuidelines.title")}
              titleClassName="!text-nasun-scarlet"
            >
              <p className="text-nasun-white/85 leading-relaxed">
                {t("info.rulesGuidelines.description")}
              </p>
            </DividerBox>
          </div>
        </section>

        {/* Go to Leaderboard Button */}
        <div className="flex justify-center">
          <Link to="/leaderboard" className={buttonVariants({ variant: "c3", size: "xl" })}>
            {t("info.goToLeaderboard")}
            <FontAwesomeIcon icon={faArrowRight} className="ml-2 w-4 h-4" />
          </Link>
        </div>
      </div>
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
