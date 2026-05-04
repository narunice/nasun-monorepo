import type { FC } from "react";
import { VARIANTS } from "./slideVariants";
import { SlideShell, Icon, tagIconColor } from "./sharedSlideUI";
import type { OnboardingCard } from "./onboardingCards";

interface Props {
  card: OnboardingCard;
}

// Evergreen onboarding card rendered in place of a bonus slide when the user
// has fewer than 4 bonus awards. Visual chrome (glow, grain, sparkles) is
// shared with BonusCelebrationSlide via SlideShell and VARIANTS token reuse.
export const OnboardingSlide: FC<Props> = ({ card }) => {
  const variant = VARIANTS[card.variantKey];

  return (
    <SlideShell glowGradient={variant.glowGradient} watermark="nasun.io">
      <div className="relative h-full flex flex-col px-4 sm:px-5 pt-5 sm:pt-6 pb-8 sm:pb-9">
        <div className="flex flex-col items-center text-center gap-3 sm:gap-4">
          <p className="text-base sm:text-xl font-extrabold tracking-[0.22em] bg-clip-text text-transparent bg-gradient-to-r from-pado-lavender via-pink-300 to-pink-400 drop-shadow-[0_1px_8px_rgba(244,114,182,0.25)]">
            {card.eyebrow}
          </p>

          <h3 className="inline-flex items-center gap-2 text-lg sm:text-xl font-semibold text-white leading-tight">
            <Icon
              name={card.iconKey}
              className={`w-5 h-5 ${tagIconColor(card.variantKey)}`}
            />
            <span>{card.headline}</span>
          </h3>

          <p className="text-sm text-uju-secondary/85 leading-snug max-w-[28ch]">
            {card.description}
          </p>
        </div>

        <div className="mt-auto flex justify-center">
          {card.renderCta()}
        </div>
      </div>
    </SlideShell>
  );
};
