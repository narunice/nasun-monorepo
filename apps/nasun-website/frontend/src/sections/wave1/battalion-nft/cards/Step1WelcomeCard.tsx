/**
 * Step 1 Welcome Card
 *
 * @description
 * NFT Event의 첫 번째 단계 - 이벤트 소개, 참여 요건, 보상 안내
 *
 * @author Claude Code
 * @date 2025-11-02
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { FiCheck, FiAward, FiFeather, FiUsers } from "react-icons/fi";
import { DividerBox, OuterBox } from "@/components/ui";

interface Step1WelcomeCardProps {
  onStartClick: () => void;
}

export const Step1WelcomeCard: React.FC<Step1WelcomeCardProps> = ({ onStartClick }) => {
  const { t } = useTranslation("battalion-nft");

  return (
    <OuterBox color="c5" className="max-w-3xl mx-auto">
      <div className="text-center">
        <div className="">{/* ... icon ... */}</div>
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">{t("step1.title")}</h4>
        <p className="mb-6 max-w-lg mx-auto">{t("header.description")}</p>
        <div className="space-y-4 md:space-y-8 mb-4 md:mb-8">
          <DividerBox
            color="c4"
            padding="sm"
            disableHover={true}
            icon="📋"
            title={t("step1.requirements.title")}
            className="text-left"
          >
            <ul className="space-y-2 ">
              <li className="flex items-start gap-2">
                <FiCheck className="mt-1 flex-shrink-0" /> {t("step1.requirements.item1")}
              </li>
              <li className="flex items-start gap-2">
                <FiCheck className="mt-1 flex-shrink-0" /> {t("step1.requirements.item2")}
              </li>
              <li className="flex items-start gap-2">
                <FiCheck className="mt-1 flex-shrink-0" /> {t("step1.requirements.item3")}
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-around gap-4">
              <Button asChild variant="link" size="sm" className="gap-2 -mb-2 ">
                <a
                  href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                  {t("step1.links.officialAccount")}
                </a>
              </Button>
              <Button asChild variant="link" size="sm" className="gap-2 -mb-2">
                <a
                  href={`https://x.com/${
                    import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"
                  }/status/${import.meta.env.VITE_EVENT_TWEET_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                  {t("step1.links.eventPost")}
                </a>
              </Button>
            </div>
          </DividerBox>
          <DividerBox
            color="c3"
            icon="🎁"
            padding="sm"
            disableHover={true}
            title={t("step1.rewards.title")}
            className="text-left"
          >
            <ul className="space-y-2 text-nasun-white/80 font-rubik font-light">
              <li className="flex items-start gap-2">
                <FiAward className="mt-1 flex-shrink-0" /> {t("step1.rewards.item1")}
              </li>
              <li className="flex items-start gap-2">
                <FiFeather className="mt-1 flex-shrink-0" /> {t("step1.rewards.item2")}
              </li>
              <li className="flex items-start gap-2">
                <FiAward className="mt-1 flex-shrink-0" /> {t("step1.rewards.item3")}
              </li>
              <li className="flex items-start gap-2">
                <FiAward className="mt-1 flex-shrink-0" /> {t("step1.rewards.item4")}
              </li>
              <li className="flex items-start gap-2">
                <FiUsers className="mt-1 flex-shrink-0" /> {t("step1.rewards.item5")}
              </li>
            </ul>
          </DividerBox>
        </div>
        <Button onClick={onStartClick} variant="c5" size="lg" className="flex mx-auto">
          {t("step1.button")}
        </Button>
      </div>
    </OuterBox>
  );
};
