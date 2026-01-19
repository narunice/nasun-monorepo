import React, { useState } from "react";
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
  faChevronUp,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { buttonVariants } from "../../../ui/button-variants";

const TARGET_ACCOUNT = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
const FOLLOW_INTENT_URL = `https://twitter.com/intent/follow?screen_name=${TARGET_ACCOUNT}`;

const LeaderboardInfoSection: React.FC = () => {
  const { t } = useTranslation("leaderboard");
  const [rulesExpanded, setRulesExpanded] = useState(false);

  const prohibitedHeadlines = t("info.rulesGuidelines.prohibited.headlines", {
    returnObjects: true,
  }) as string[];
  const prohibitedItems = t("info.rulesGuidelines.prohibited.items", {
    returnObjects: true,
  }) as string[];
  const dataPrivacyItems = t("info.dataPrivacy.items", {
    returnObjects: true,
  }) as string[];
  const finalNotesItems = t("info.scoringOverview.finalNotes.items", {
    returnObjects: true,
  }) as string[];

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
            <DividerBox
              color="w1"
              disableHover={true}
              title={t("info.scoringOverview.title")}
              titleClassName=""
            >
              <div className="space-y-4">
                <p className="text-nasun-white/85 leading-relaxed">
                  {t("info.scoringOverview.description")}
                </p>
                <p className="text-nasun-white/70 text-sm leading-relaxed">
                  {t("info.scoringOverview.policyNote")}
                </p>
                <div>
                  <h6 className="mb-2">{t("info.scoringOverview.finalNotes.title")}</h6>
                  <ul className="list-disc marker:text-nasun-c2 pl-6 space-y-1 text-nasun-white/80">
                    {finalNotesItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </DividerBox>

            {/* Rules & Guidelines Box */}
            <DividerBox
              color="c5"
              disableHover={true}
              title={t("info.rulesGuidelines.title")}
              titleClassName="!text-nasun-scarlet"
            >
              <p className="text-nasun-white/85 leading-relaxed">
                {t("info.rulesGuidelines.description")}
              </p>

              {/* Prohibited Headlines - Always Visible */}
              <ul className="list-disc marker:text-nasun-scarlet pl-6 space-y-1 text-nasun-white/90 mt-3">
                {prohibitedHeadlines.map((headline, i) => (
                  <li key={i} className="font-medium">
                    {headline}
                  </li>
                ))}
              </ul>

              {/* Expand/Collapse Button */}
              <button
                onClick={() => setRulesExpanded(!rulesExpanded)}
                className="mt-3 text-nasun-c1 hover:text-nasun-c2 transition-colors flex items-center gap-2 text-sm"
              >
                <span>
                  {rulesExpanded
                    ? t("info.rulesGuidelines.collapse")
                    : t("info.rulesGuidelines.expand")}
                </span>
                <FontAwesomeIcon
                  icon={rulesExpanded ? faChevronUp : faChevronDown}
                  className="w-3 h-3"
                />
              </button>

              {/* Expanded Content - Detailed Descriptions */}
              {rulesExpanded && (
                <div className="mt-4 space-y-3 border-t border-nasun-white/10 pt-4">
                  <ul className="list-disc marker:text-nasun-scarlet pl-6 space-y-2 text-nasun-white/80">
                    {prohibitedItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <p className="text-nasun-white/70 text-sm italic">
                    {t("info.rulesGuidelines.prohibited.disclaimer")}
                  </p>
                </div>
              )}
            </DividerBox>

            {/* Data & Privacy Box */}
            <DividerBox
              color="c5"
              disableHover={true}
              title={t("info.dataPrivacy.title")}
              titleClassName="!text-nasun-white"
            >
              <p className="">{t("info.dataPrivacy.description")}</p>
              <h6 className="mt-3">{t("info.dataPrivacy.apiUsageTitle")}</h6>
              <ul className="list-disc marker:text-nasun-c4 pl-6 space-y-1 text-nasun-white/80 mt-2">
                {dataPrivacyItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
              <p className="text-nasun-white/80 mt-3">{t("info.dataPrivacy.scoringNote")}</p>
            </DividerBox>

          </div>
        </section>

        {/* Go to Leaderboard Button */}
        <div className="flex justify-center">
          <Link to="/wave1/leaderboard" className={buttonVariants({ variant: "c3", size: "xl" })}>
            {t("info.goToLeaderboard")}
            <FontAwesomeIcon icon={faArrowRight} className="ml-2 w-4 h-4" />
          </Link>
        </div>
      </div>
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
