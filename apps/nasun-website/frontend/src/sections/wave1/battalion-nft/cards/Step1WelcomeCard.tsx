/**
 * Step 1 Welcome Card
 *
 * @description
 * NFT Event의 첫 번째 단계 - 이벤트 소개, 참여 요건, 보상 안내
 *
 * @author Claude Code
 * @date 2025-11-02
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ExternalLink } from "lucide-react";
import { FiCheck, FiAward, FiFeather, FiUsers, FiGift, FiStar } from "react-icons/fi";
import { OuterBox } from "@/components/ui";

interface Step1WelcomeCardProps {
  onStartClick: () => void;
}

export const Step1WelcomeCard: React.FC<Step1WelcomeCardProps> = ({ onStartClick }) => {
  const { t } = useTranslation("battalion-nft");
  const [checkPhase, setCheckPhase] = useState(0);

  // Sequential checkmark animation loop (0→1→2→3→0: accumulate then reset)
  useEffect(() => {
    const interval = setInterval(() => {
      setCheckPhase((prev) => (prev + 1) % 4);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <OuterBox color="nw0" className=" max-w-3xl mx-auto">
      <div className="text-center">
        <div className="">{/* ... icon ... */}</div>
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto pt-2 md:pt-4 lg:pt-6">
          {t("step1.title")}
        </h4>
        <p className="mb-8 md:mb-10 lg:mb-12 max-w-lg mx-auto">{t("header.description")}</p>

        {/* Requirements */}
        <div className="text-left mb-6 md:mb-8 lg:mb-10">
          <h5 className="text-nasun-nw4 font-medium mb-3">📋 {t("step1.requirements.title")}</h5>
          <ul className="space-y-2 mb-4">
            <li className="flex items-start gap-2">
              <FiCheck
                className={`mt-1 flex-shrink-0 transition-colors duration-300 ${
                  checkPhase >= 1 ? "text-green-300" : ""
                }`}
              />
              {t("step1.requirements.item1")}
            </li>
            <li className="flex items-start gap-2">
              <FiCheck
                className={`mt-1 flex-shrink-0 transition-colors duration-300 ${
                  checkPhase >= 2 ? "text-green-300" : ""
                }`}
              />
              {t("step1.requirements.item2")}
            </li>
            <li className="flex items-start gap-2">
              <FiCheck
                className={`mt-1 flex-shrink-0 transition-colors duration-300 ${
                  checkPhase >= 3 ? "text-green-300" : ""
                }`}
              />
              {t("step1.requirements.item3")}
            </li>
          </ul>
          <div className="flex items-center justify-around gap-4">
            <Button asChild variant="link" size="sm" className="gap-2">
              <a
                href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} />
                {t("step1.links.officialAccount")}
              </a>
            </Button>
            <Button asChild variant="link" size="sm" className="gap-2">
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
        </div>

        {/* Rewards */}
        <div className="text-left mb-6 md:mb-8">
          <h5 className="text-nasun-nw4 font-medium mb-3">🎁 {t("step1.rewards.title")}</h5>
          <ul className="space-y-2 text-nasun-white/80 font-rubik font-light">
            <li className="flex items-start gap-2">
              <FiAward className="mt-1 flex-shrink-0 text-nasun-nw4" /> {t("step1.rewards.item1")}
            </li>
            <li className="flex items-start gap-2">
              <FiFeather className="mt-1 flex-shrink-0 text-nasun-nw4" /> {t("step1.rewards.item2")}
            </li>
            <li className="flex items-start gap-2">
              <FiGift className="mt-1 flex-shrink-0 text-nasun-nw4" /> {t("step1.rewards.item3")}
            </li>
            <li className="flex items-start gap-2">
              <FiStar className="mt-1 flex-shrink-0 text-nasun-nw4" /> {t("step1.rewards.item4")}
            </li>
            <li className="flex items-start gap-2">
              <FiUsers className="mt-1 flex-shrink-0 text-nasun-nw4" /> {t("step1.rewards.item5")}
            </li>
          </ul>
        </div>
        <ButtonV3 onClick={onStartClick} variant="nw2" size="lg" className="flex mx-auto">
          {t("step1.button")}
        </ButtonV3>
      </div>
    </OuterBox>
  );
};
