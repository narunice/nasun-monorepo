/**
 * Step 1 Welcome Card
 *
 * @description
 * NFT Event intro card — Genesis overview, benefits, details, allowlist steps
 */

import React, { useState, useEffect } from "react";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ArrowUpRight } from "lucide-react";
import { FiCheck } from "react-icons/fi";
import { OuterBox, DividerBox } from "@/components/ui";
import { isMobileBrowser, isAndroidBrowser, isMetaMaskInAppBrowser, isIOSSafari } from "@/utils/mobileDetect";

interface Step1WelcomeCardProps {
  onStartClick: () => void;
}

const JOIN_STEPS = [
  "Follow @Nasun_io",
  "Like & Repost any @Nasun_io post",
  "Submit your wallet address",
] as const;

export const Step1WelcomeCard: React.FC<Step1WelcomeCardProps> = ({ onStartClick }) => {
  const [checkPhase, setCheckPhase] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

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
    <OuterBox color="c6" className="max-w-3xl mx-auto ">
      <div className="pt-2 md:pt-3 lg:pt-4">
        {/* Title */}
        <h4 className="!font-rubik font-medium mb-4 text-center">Welcome to Nasun</h4>

        {/* Intro */}
        <div className="mb-6 md:mb-8">
          <p>
            Genesis is Nasun's launch-phase membership credential. Three live platforms. One
            access key.
          </p>
        </div>

        {/* Join the allowlist */}
        <DividerBox
          title="Join the allowlist"
          hideDivider
          color="nw4"
          className="mb-6 md:mb-8 lg:mb-10 !bg-gray-900"
          titleClassName="!w-full !text-center"
          disableHover
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-3">
            <ul className="space-y-2">
              {JOIN_STEPS.map((text, i) => (
                <li key={i} className="flex items-start gap-2">
                  <FiCheck
                    className={`mt-1 flex-shrink-0 transition-colors duration-300 ${
                      checkPhase >= i + 1 ? "text-green-300" : ""
                    }`}
                  />
                  {text}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <ButtonV3 variant="nw5" outline size="sm" asChild>
                <a
                  href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5 font-normal"
                >
                  Follow @Nasun_io
                  <ArrowUpRight size={13} />
                </a>
              </ButtonV3>
              <ButtonV3 variant="nw5" outline size="sm" asChild>
                <a
                  href={`https://x.com/${import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io"}/status/${import.meta.env.VITE_EVENT_TWEET_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5 font-normal"
                >
                  Featured Post
                  <ArrowUpRight size={13} />
                </a>
              </ButtonV3>
            </div>
          </div>
        </DividerBox>

        {/* CTA */}
        <div className="text-center mb-6 md:mb-8">
          <ButtonV3
            onClick={onStartClick}
            variant="nw2"
            size="lg"
            className="flex mx-auto"
            disabled={isMobileBrowser() && !isIOSSafari() && !isMetaMaskInAppBrowser()}
          >
            Get Started
          </ButtonV3>
        </div>

        {/* Mobile non-Safari users */}
        {isMobileBrowser() && !isIOSSafari() && !isMetaMaskInAppBrowser() && (
          <DividerBox color="nw4" padding="sm" className="mb-6 md:mb-8 !bg-black/30">
            <p className="text-sm mb-2">
              <span className="text-yellow-300">For mobile users:</span>
              {isAndroidBrowser()
                ? " for a smoother wallet connection, we recommend starting the process in MetaMask's built-in browser."
                : " for a smoother wallet connection, we recommend using MetaMask's built-in browser or Safari."}
            </p>
            <div className="flex flex-col gap-4 items-center">
              <ButtonV3
                variant="nw5"
                outline
                size="sm"
                onClick={() => {
                  const { host, pathname } = window.location;
                  window.open(`https://metamask.app.link/dapp/${host}${pathname}`, "_self");
                }}
              >
                Open in MetaMask
              </ButtonV3>
              {!isAndroidBrowser() && (
                <ButtonV3
                  variant="nw5"
                  outline
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                >
                  {linkCopied ? "Copied! Paste in Safari" : "Copy Link for Safari"}
                </ButtonV3>
              )}
            </div>
            <p className="text-xs text-nasun-white/50 mt-3 text-center">
              If you experience issues with wallet connection, please try again on desktop.
            </p>
          </DividerBox>
        )}

        {/* Legal disclaimer */}
        <p className="text-nasun-nw4 text-xs">
          Nothing on this page constitutes an offer of securities or a financial instrument in any
          jurisdiction. Please review our Terms of Service before purchase.
        </p>

      </div>
    </OuterBox>
  );
};
