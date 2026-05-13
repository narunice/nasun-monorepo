/**
 * Step 1 Welcome Card
 *
 * @description
 * NFT Event intro card — Battalion overview, benefits, details, allowlist steps
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

const LIVE_TODAY = [
  "Nasun Wallet",
  "Network Faucet",
  "zkLogin onboarding",
  "On-chain governance participation, active now",
] as const;

const UNLOCKS = [
  "Early participation access to organized alpha testing for Pado, SPECTRA, and Nasun AI",
  "Eligibility for activity-based community programs earned through meaningful ecosystem participation. Not for passive holding.",
] as const;

const JOIN_STEPS = [
  "Follow @Nasun_io",
  "Like & Repost any @Nasun_io post",
  "Submit your wallet address",
] as const;

export const Step1WelcomeCard: React.FC<Step1WelcomeCardProps> = ({ onStartClick }) => {
  const [checkPhase, setCheckPhase] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

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
    <OuterBox color="c6" className="max-w-3xl mx-auto ">
      <div className="pt-2 md:pt-3 lg:pt-4">
        {/* Title */}
        <h4 className="!font-rubik font-medium mb-4 text-center">Welcome to Nasun</h4>

        {/* Intro */}
        <div className="mb-6 md:mb-8">
          <p>
            Battalion is Nasun's launch-phase membership credential. Three live platforms. One
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

        {/* Mobile non-Safari users: redirect to MetaMask in-app browser for reliable wallet connection */}
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

        {/* What You Hold */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">What You Hold</h5>
          <p className="mb-2">
            The Battalion NFT is the Battalion Rifle, a unique in-game asset within the SPECTRA
            universe, built in Unreal Engine 5.
          </p>
          <p className="mb-2">
            Each Battalion Rifle exists as a unique object on the Nasun network. It is usable in a
            live, playable game environment today.
          </p>
          <p>This is a functional digital asset inside an operating ecosystem.</p>
        </div>

        {/* What's Live Today */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">What's Live Today</h5>
          <p className="mb-3">
            The following infrastructure is live and publicly accessible today:
          </p>
          <ul className="space-y-2">
            {LIVE_TODAY.map((text, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* What It Unlocks */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">
            What It Unlocks As the Ecosystem Expands
          </h5>
          <p className="mb-3">
            As new features and testing phases open across Nasun's products, Battalion holders may
            receive:
          </p>
          <ul className="space-y-2">
            {UNLOCKS.map((text, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Details */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">Details</h5>
          <ul className="space-y-2 mb-3">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
              Maximum 4 NFTs per wallet at mint
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
              Up to 7 NFTs per wallet counted toward access tiers
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
              Holding multiple NFT types may increase access eligibility
            </li>
          </ul>
          <p className="font-normal text-sm text-nasun-nw4">
            Allowlist spots are limited to the first 500 participants.
          </p>
        </div>

        {/* What It Is */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">What It Is</h5>
          <p>
            A functional in-game asset. A launch-phase ecosystem membership credential. A record of
            early participation on-chain. Access to live software and testing environments.
          </p>
        </div>

        {/* What It Is Not */}
        <div className="mb-6 md:mb-8">
          <h5 className="text-nasun-white font-medium mb-3">What It Is Not</h5>
          <p className="mb-2">
            The Battalion NFT is not an investment. It does not represent equity, ownership, or
            revenue share. It does not grant or guarantee token allocations. It does not promise
            profits or financial returns.
          </p>
          <p className="mb-2">
            Participation in future ecosystem mechanics, if any, will be activity-based, subject to
            change, and determined at Nasun's discretion.
          </p>
          <p className="text-nasun-nw4 text-xs">
            Nothing on this page constitutes an offer of securities or a financial instrument in any
            jurisdiction. Please review our Terms of Service before purchase.
          </p>
        </div>

      </div>
    </OuterBox>
  );
};
