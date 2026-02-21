/**
 * Step 1 Welcome Card
 *
 * @description
 * NFT Event intro card — Battalion overview, benefits, details, allowlist steps
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ExternalLink } from "lucide-react";
import { FiCheck } from "react-icons/fi";
import { OuterBox, DividerBox } from "@/components/ui";

interface Step1WelcomeCardProps {
  onStartClick: () => void;
}

export const Step1WelcomeCard: React.FC<Step1WelcomeCardProps> = ({ onStartClick }) => {
  const { t } = useTranslation("battalion-nft");
  const [checkPhase, setCheckPhase] = useState(0);

  // Sequential checkmark animation for Join the allowlist items
  useEffect(() => {
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count >= 12) {
        clearInterval(interval);
        setCheckPhase(3);
        return;
      }
      setCheckPhase((prev) => (prev + 1) % 4);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <OuterBox color="nw0" className="max-w-3xl mx-auto">
      <div className="pt-2 md:pt-3 lg:pt-4">
        {/* Title */}
        <h4 className="!font-rubik font-medium mb-4 text-center">{t("step1.title")}</h4>

        {/* Intro */}
        <div className="mb-6 md:mb-8">
          <p className="mb-3">{t("step1.intro1")}</p>
          <p>{t("step1.intro2")}</p>
        </div>

        {/* What you get */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">{t("step1.whatYouGet.title")}</h5>
          <ul className="space-y-2">
            {(
              [
                { key: "step1.whatYouGet.item1", head: "Staking rewards" },
                { key: "step1.whatYouGet.item2", head: "Early access" },
                { key: "step1.whatYouGet.item3", head: "Preferential terms" },
                { key: "step1.whatYouGet.item4", head: "Governance weight" },
                { key: "step1.whatYouGet.item5", head: "On-chain founding member" },
                { key: "step1.whatYouGet.item6", head: "Airdrop multipliers" },
              ] as const
            ).map(({ key, head }) => {
              const text = t(key);
              const rest = text.slice(head.length);
              return (
                <li key={key} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                  <span>
                    <span className="font-semibold text-nasun-nw4">{head}</span>
                    {rest}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Details */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">{t("step1.details.title")}</h5>
          <ul className="space-y-2">
            {(["step1.details.item1", "step1.details.item2", "step1.details.item3"] as const).map(
              (key) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                  {t(key)}
                </li>
              ),
            )}
          </ul>
        </div>

        {/* Join the allowlist */}
        <DividerBox
          title={t("step1.joinAllowlist.title")}
          hideDivider
          color="nw0"
          className="mb-6 md:mb-8 lg:mb-10"
          titleClassName="!w-full !text-center"
          disableHover
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-3">
            <ul className="space-y-2">
              {(
                [
                  "step1.joinAllowlist.item1",
                  "step1.joinAllowlist.item2",
                  "step1.joinAllowlist.item3",
                ] as const
              ).map((key, i) => (
                <li key={key} className="flex items-start gap-2">
                  <FiCheck
                    className={`mt-1 flex-shrink-0 transition-colors duration-300 ${
                      checkPhase >= i + 1 ? "text-green-300" : ""
                    }`}
                  />
                  {t(key)}
                </li>
              ))}
            </ul>
            <div className="flex flex-row justify-around md:flex-col gap-2 flex-shrink-0">
              <a
                href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-nasun-nw4/40 text-nasun-nw4 text-xs hover:bg-nasun-nw4/10 transition-colors"
              >
                {t("step1.links.followAccount")}
                <ExternalLink size={13} />
              </a>
              <a
                href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}/status/${import.meta.env.VITE_EVENT_TWEET_ID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-nasun-nw4/40 text-nasun-nw4 text-xs hover:bg-nasun-nw4/10 transition-colors"
              >
                {t("step1.links.announcementPost")}
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </DividerBox>

        {/* CTA */}
        <div className="text-center">
          <ButtonV3 onClick={onStartClick} variant="nw2" size="lg" className="flex mx-auto">
            {t("step1.button")}
          </ButtonV3>
        </div>
      </div>
    </OuterBox>
  );
};
