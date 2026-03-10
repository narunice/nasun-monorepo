import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrophy,
  faGem,
  faBolt,
  faCircleDot,
  faBullseye,
  faLightbulb,
  faTriangleExclamation,
  faScaleBalanced,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useAuth } from "@/features/auth";
import { getTwitterHandle } from "@/utils/getTwitterHandle";
import { useAccountLinking } from "@/sections/myAccount/hooks/useAccountLinking";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WalletConnect } from "@nasun/wallet-ui";
import { useNasunWalletAuth } from "@/features/wallet/hooks/useNasunWalletAuth";
import { useWallet, useZkLogin } from "@nasun/wallet";

const TIERS = ["platinum", "gold", "silver", "bronze"] as const;

const TIER_CONFIG: Record<
  (typeof TIERS)[number],
  {
    icon: typeof faTrophy | null;
    accentClass: string;
    iconColorClass: string;
    bgClass: string;
    name: string;
    recognition: string;
  }
> = {
  platinum: {
    icon: faTrophy,
    accentClass: "text-nasun-white",
    iconColorClass: "text-amber-300",
    bgClass: "bg-nasun-white/[0.08]",
    name: "Platinum",
    recognition:
      "USDC Reward + 1 Free Battalion NFT + GTD Whitelist for Battalion NFT",
  },
  gold: {
    icon: faGem,
    accentClass: "text-nasun-c1",
    iconColorClass: "text-nasun-c1",
    bgClass: "bg-nasun-c1/[0.08]",
    name: "Gold",
    recognition:
      "USDC Reward + 1 Discounted Battalion NFT + Whitelist for Battalion NFT",
  },
  silver: {
    icon: faBolt,
    accentClass: "text-nasun-nw4",
    iconColorClass: "text-nasun-nw4",
    bgClass: "bg-nasun-nw4/[0.08]",
    name: "Silver",
    recognition: "USDC Reward + Whitelist for Battalion NFT",
  },
  bronze: {
    icon: null,
    accentClass: "text-nasun-white/50",
    iconColorClass: "",
    bgClass: "bg-nasun-white/[0.05]",
    name: "Bronze",
    recognition: "Whitelist for Battalion NFT + Community Recognition",
  },
};

const HOW_IT_WORKS_ITEMS = [
  "Up to $25,000 USDC total",
  "Free Genesis Pass NFT",
  "Enter exclusive raffles",
];

const EVALUATION_ITEMS = [
  "Thoughtful analysis of Nasun's products and architecture",
  "Educational threads or videos explaining ecosystem components",
  "Creative media (design, memes, short-form video)",
  "Constructive discussion and feedback",
];

const REWARD_NOTES = [
  "Final USDC reward amounts will be confirmed prior to distribution. All rewards are funded from Nasun's marketing allocation.",
  "Tier structure and eligibility criteria are fixed at leaderboard launch.",
  "Tier sizes are limited. Final rankings are determined at leaderboard close.",
];

const COMPLIANCE_PARAGRAPHS = [
  "Rewards are provided as marketing compensation for content contributions. Participants receiving compensation must clearly disclose their relationship with Nasun in accordance with applicable advertising and disclosure laws, including #ad or #sponsored where required.",
  "No participant may make financial return claims about the Battalion NFT or any Nasun product. The Battalion NFT is a digital membership product and not an investment.",
  "Nasun reserves the right to remove participants who violate these standards.",
];

const LeaderboardInfoSection: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { handleLinkTwitter } = useAccountLinking({ user });
  const { signFlow } = useNasunWalletAuth();
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const [showEligibleModal, setShowEligibleModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const signFlowCalledRef = useRef(false);

  const hasXConnected = user?.provider === "Twitter" || !!user?.linkedAccounts?.twitter;
  const isAnyConnected = status === "unlocked" || isZkConnected;

  // Wallet unlock → signFlow → navigate to /my-account
  const handleWalletUnlocked = useCallback(async () => {
    if (signFlowCalledRef.current) return;
    signFlowCalledRef.current = true;
    setSigningIn(true);
    try {
      await signFlow();
      setShowWalletModal(false);
      navigate("/my-account?guidance=link-x");
    } catch (err) {
      signFlowCalledRef.current = false;
      setSigningIn(false);
      localStorage.removeItem("auth_return_to");
      if (import.meta.env.DEV) console.error("[wallet auth]", err);
    }
  }, [signFlow, navigate]);

  // Already-unlocked wallet: trigger signFlow immediately on modal open
  useEffect(() => {
    if (showWalletModal && isAnyConnected) handleWalletUnlocked();
  }, [showWalletModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset guards when wallet modal closes (without completing auth)
  useEffect(() => {
    if (!showWalletModal) {
      signFlowCalledRef.current = false;
      setSigningIn(false);
      localStorage.removeItem("auth_return_to");
    }
  }, [showWalletModal]);

  // Auto-show eligible modal after returning from X OAuth linking
  useEffect(() => {
    if (searchParams.get("x_linked") === "1" && hasXConnected) {
      setShowEligibleModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, hasXConnected, setSearchParams]);

  const handleXAction = () => {
    if (hasXConnected) {
      setShowEligibleModal(true);
    } else if (isAuthenticated) {
      // Logged in but no X connected — start OAuth linking directly
      localStorage.setItem("auth_return_to", "/wave1/leaderboard-guide?x_linked=1");
      handleLinkTwitter();
    } else {
      // Not logged in — show wallet login modal
      localStorage.setItem("auth_return_to", "/my-account?guidance=link-x");
      setShowWalletModal(true);
    }
  };

  return (
    <SectionLayout className="!max-w-5xl">
      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* --- Hero Header --- */}
        <header className="flex flex-col items-center text-center gap-4">
          <PageTitle as="h2" align="center">
            Nasun Leaderboard
          </PageTitle>

          <p className="max-w-2xl text-lg font-medium">Help shape the Nasun ecosystem.</p>

          <p className="max-w-2xl whitespace-pre-line text-nasun-white/70">
            {
              "The Nasun Leaderboard recognizes thoughtful, creative contributions that expand understanding of Nasun's live infrastructure and products.\nParticipation is merit-based and content-driven."
            }
          </p>
        </header>

        {/* --- How To Join --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faBolt} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">How To Join</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          <p>
            Sign up to this website and link your{" "}
            <button
              onClick={handleXAction}
              className="text-nasun-nw1 underline font-medium cursor-pointer"
            >
              X account{" "}
            </button>
          </p>
        </section>

        {/* --- How It Works --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faLightbulb} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">How It Works</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          <p className="mb-4">
            Active contributors who create high-quality, original content about Nasun's ecosystem
            are recognized through:
          </p>

          <ul className="space-y-2.5 mb-5">
            {HOW_IT_WORKS_ITEMS.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <p className="">
            Rewards are based on contribution quality and ecosystem engagement, — not on purchases
            or sales activity.
          </p>
          <p className="">Starting Date March 11</p>
        </section>

        {/* --- Ranks & Recognition Table --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faBullseye} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">Ranks & Recognition</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          <p className="mb-5">
            Top contributors will be placed into recognition tiers based on contribution quality and
            consistency.
          </p>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto bg-nasun-nw3/10 border border-nasun-nw4/30 rounded-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-nasun-nw3/20 border-b border-nasun-nw4/30">
                  <th className="px-4 py-3 text-left uppercase tracking-wider text-nasun-nw4 font-medium w-40">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left uppercase tracking-wider text-nasun-nw4 font-medium">
                    Recognition
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => {
                  const config = TIER_CONFIG[tier];
                  return (
                    <tr
                      key={tier}
                      className={`${config.bgClass} transition-colors hover:bg-nasun-white/[0.03]`}
                    >
                      <td className={`px-4 py-4 font-medium ${config.accentClass}`}>
                        <span className="flex items-center gap-2">
                          {config.icon && (
                            <FontAwesomeIcon
                              icon={config.icon}
                              className={`w-4 h-4 ${config.iconColorClass}`}
                            />
                          )}
                          {config.name}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-nasun-white/80">{config.recognition}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="flex flex-col gap-3 md:hidden">
            {TIERS.map((tier) => {
              const config = TIER_CONFIG[tier];
              return (
                <div
                  key={tier}
                  className={`${config.bgClass} border border-nasun-white/[0.08] rounded-sm p-4`}
                >
                  <h6 className={`flex items-center gap-2 font-medium mb-2 ${config.accentClass}`}>
                    {config.icon && (
                      <FontAwesomeIcon
                        icon={config.icon}
                        className={`w-4 h-4 ${config.iconColorClass}`}
                      />
                    )}
                    {config.name}
                  </h6>
                  <p className="text-nasun-white/70">{config.recognition}</p>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div className="mt-5 space-y-2">
            {REWARD_NOTES.map((note, i) => (
              <p key={i} className="text-sm text-nasun-white/50">
                {note}
              </p>
            ))}
          </div>
        </section>

        {/* --- How Contributions Are Evaluated + Transparency & Compliance --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {/* How Contributions Are Evaluated */}
          <OuterBox color="noborder" padding="sm" className="bg-nasun-c6">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faCircleDot} className="w-4 h-4 text-nasun-nw1" />
              <h6 className="font-medium uppercase tracking-wider">
                How Contributions Are Evaluated
              </h6>
            </div>
            <p className="mb-4">Quality contributions include:</p>
            <ul className="space-y-2.5 mb-5">
              {EVALUATION_ITEMS.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-nasun-white/70 font-medium mb-2">
              Engagement quality matters more than volume.
            </p>
            <p className="flex items-start gap-2 text-red-400/80">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 h-3.5 mt-1 shrink-0" />
              Automated engagement, spam, or inauthentic amplification will result in removal.
            </p>
          </OuterBox>

          {/* Transparency & Compliance */}
          <OuterBox color="noborder" padding="sm" className="flex flex-col bg-nasun-c6">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faScaleBalanced} className="w-4 h-4 text-nasun-nw1" />
              <h6 className="font-medium uppercase tracking-wider">Transparency & Compliance</h6>
            </div>
            <div className="space-y-4 flex-1 text-nasun-white/70 text-sm">
              {COMPLIANCE_PARAGRAPHS.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </OuterBox>
        </div>

        {/* --- CTA Buttons --- */}
        <div className="flex justify-center">
          <ButtonV3 asChild variant="nw2" size="md">
            <Link to="/wave1/leaderboard">View Live Leaderboard</Link>
          </ButtonV3>
        </div>
      </div>

      {/* --- Already Eligible Modal --- */}
      <Dialog open={showEligibleModal} onOpenChange={setShowEligibleModal}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader className="items-center">
            <FontAwesomeIcon icon={faCircleCheck} className="w-10 h-10 text-green-400 mb-2" />
            <DialogTitle>You're Eligible!</DialogTitle>
            <DialogDescription className="text-nasun-white/70">
              Your X account{" "}
              {getTwitterHandle(user) && (
                <span className="font-medium text-nasun-white">
                  @
                  {user?.originalTwitterHandle ||
                    user?.linkedAccounts?.twitter?.originalTwitterHandle ||
                    getTwitterHandle(user)}
                </span>
              )}{" "}
              is connected. You're all set to participate in the leaderboard.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <ButtonV3 asChild variant="nw2" size="sm">
              <Link to="/wave1/leaderboard">View Leaderboard</Link>
            </ButtonV3>
            <ButtonV3 asChild variant="nw2" size="sm" outline>
              <Link to="/my-account">Go to My Account</Link>
            </ButtonV3>
          </div>
        </DialogContent>
      </Dialog>
      {/* --- Wallet Login Modal --- */}
      {showWalletModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto p-4 bg-nasun-black/60 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => { if (!signingIn) setShowWalletModal(false); }}
        >
          <div
            className="relative m-auto bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-sm w-full shrink-0 animate-in fade-in-0 zoom-in-95 border border-gray-200 dark:border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            {!signingIn && (
              <button
                className="absolute top-3 right-3 z-10 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1"
                onClick={() => setShowWalletModal(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {signingIn ? (
              <div className="px-5 py-8 text-center space-y-3">
                <div className="loading-spinner mx-auto" />
                <p className="text-sm text-gray-500 dark:text-zinc-400">Signing in...</p>
              </div>
            ) : (
              <WalletConnect
                embedded
                defaultOpen
                onWalletUnlocked={handleWalletUnlocked}
                showPrivacyNotice
                lockedTitle="Unlock Wallet to Login"
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
