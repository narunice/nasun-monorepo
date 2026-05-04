import { useMemo, useEffect, type ReactNode } from "react";
import { UjuCard, UjuSectionHeader } from "../shared";
import { useBonusFeed } from "./news/useBonusFeed";
import { NewsCarousel, type CarouselSlide } from "./news/NewsCarousel";
import { BonusCelebrationSlide } from "./news/BonusCelebrationSlide";
import { OnboardingSlide } from "./news/OnboardingSlide";
import {
  WELCOME_CARD,
  ONBOARDING_PADS,
  type OnboardingCard,
} from "./news/onboardingCards";
import type { BonusFeedEntry } from "@/services/ecosystemScoreApi";

const MAX_SLIDES = 4;

export function buildSlides(
  entries: BonusFeedEntry[],
  cumulativeByCategory: Record<string, number>,
): CarouselSlide[] {
  const bonusSlides: CarouselSlide[] = entries.map((entry) => ({
    id: `bonus:${entry.id}`,
    node: (
      <BonusCelebrationSlide
        entry={entry}
        cumulative={cumulativeByCategory[entry.category]}
      />
    ) as ReactNode,
  }));

  const onboardingPool: OnboardingCard[] =
    bonusSlides.length === 0 ? [WELCOME_CARD, ...ONBOARDING_PADS] : ONBOARDING_PADS;

  const onboardingSlides: CarouselSlide[] = onboardingPool.map((card) => ({
    id: `onboarding:${card.id}`,
    node: <OnboardingSlide card={card} /> as ReactNode,
  }));

  return [...bonusSlides, ...onboardingSlides].slice(0, MAX_SLIDES);
}

export function NewsEventsCard() {
  const { isLoading, isError, data } = useBonusFeed();
  // Depend on `data` (stable ref from useBonusFeed's internal useMemo) so the
  // memo only invalidates when the server response changes, not on every render.
  const slides = useMemo(
    () => buildSlides(data?.data ?? [], data?.cumulativeByCategory ?? {}),
    [data],
  );

  useEffect(() => {
    if (isError)
      console.warn(
        "[NewsEventsCard] bonus-feed fetch failed; showing onboarding-only carousel",
      );
  }, [isError]);

  return (
    <UjuCard className="h-full">
      <UjuSectionHeader accent title="Updates" subtitle="" />
      {isLoading ? <SkeletonSlide /> : <NewsCarousel slides={slides} />}
    </UjuCard>
  );
}

function SkeletonSlide() {
  return (
    <div
      className="relative w-full min-h-[244px] sm:min-h-[260px] rounded-md overflow-hidden bg-gray-950/40 border border-uju-border/30 animate-pulse"
      aria-hidden
    >
      <div className="p-5 sm:p-6 flex flex-col h-full justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 rounded-full bg-uju-border/30" />
        </div>
        <div className="space-y-2">
          <div className="h-5 w-3/4 rounded bg-uju-border/30" />
          <div className="h-4 w-1/2 rounded bg-uju-border/20" />
        </div>
        <div className="h-12 w-32 rounded bg-uju-border/30" />
      </div>
    </div>
  );
}
