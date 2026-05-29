import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import type { SlideKind, IconKey } from "./slideVariants";
import { goToActivityDirectory } from "@/sections/uju/shared/ujuNavigation";

export interface OnboardingCard {
  id: "welcome" | "leaderboard" | "missions" | "bugreport";
  variantKey: SlideKind;
  iconKey: IconKey;
  eyebrow: string;
  headline: string;
  description: string;
  renderCta: () => ReactNode;
}

// Shared CTA button class. Height/padding kept close to BonusCelebrationSlide's
// footer line so the visual weight matches when the two slide types interleave.
export const CTA_CLASSES =
  "inline-block text-sm font-semibold py-1.5 px-3.5 rounded-full border border-pado-3/40 text-pado-3 bg-pado-3/10 hover:bg-pado-3/20 transition-colors";

function WelcomeCta() {
  const [, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() => goToActivityDirectory(setSearchParams)}
      className={CTA_CLASSES}
    >
      Explore Apps
    </button>
  );
}

function LeaderboardCta() {
  return (
    <Link
      to="/leaderboards/nasun-ecosystem-leaderboard"
      className={CTA_CLASSES}
    >
      View Leaderboard
    </Link>
  );
}

function scrollToDailyMissions() {
  const el = document.querySelector<HTMLElement>(
    '[data-uju-anchor="daily-missions"]',
  );
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // Only add a programmatic tabindex if the element doesn't already have one,
  // so we don't overwrite an existing meaningful tabIndex value.
  const hadTabindex = el.hasAttribute("tabindex");
  if (!hadTabindex) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  if (!hadTabindex) {
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), {
      once: true,
    });
  }
}

function MissionsCta() {
  return (
    <button
      type="button"
      onClick={scrollToDailyMissions}
      className={CTA_CLASSES}
      aria-label="View today's missions, scrolls to Daily Missions section"
    >
      View Today's Missions
    </button>
  );
}

function BugReportCta() {
  return (
    <Link to="/uju?tab=activity" className={CTA_CLASSES}>
      Submit a Report
    </Link>
  );
}

export const WELCOME_CARD: OnboardingCard = {
  id: "welcome",
  variantKey: "generic",
  iconKey: "sparkle",
  eyebrow: "WELCOME TO NASUN",
  headline: "Start Earning Points",
  description:
    "Activate apps, complete missions, and climb the leaderboard to earn bonus rewards.",
  renderCta: () => <WelcomeCta />,
};

export const LEADERBOARD_CARD: OnboardingCard = {
  id: "leaderboard",
  variantKey: "leaderboard-eco",
  iconKey: "trophy",
  eyebrow: "WEEKLY COMPETITION",
  headline: "Ecosystem Leaderboard",
  description:
    "Rank weekly among all participants and earn bonus points every settlement.",
  renderCta: () => <LeaderboardCta />,
};

export const MISSIONS_CARD: OnboardingCard = {
  id: "missions",
  variantKey: "generic",
  iconKey: "controller",
  eyebrow: "DAILY ENGAGEMENT",
  headline: "Complete Daily Missions",
  description:
    "Use Pado and other apps every day to rack up ecosystem points automatically.",
  renderCta: () => <MissionsCta />,
};

export const BUGREPORT_CARD: OnboardingCard = {
  id: "bugreport",
  variantKey: "bugreport",
  iconKey: "bug",
  eyebrow: "HELP IMPROVE NASUN",
  headline: "Submit Bug Reports",
  description:
    "Found something wrong? Report it and earn bonus points when it gets accepted.",
  renderCta: () => <BugReportCta />,
};

export const ONBOARDING_PADS: OnboardingCard[] = [
  LEADERBOARD_CARD,
  MISSIONS_CARD,
  BUGREPORT_CARD,
];
