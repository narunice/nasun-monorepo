import { FC } from "react";
import { SafeTweet } from "@/components/SafeTweet";
import { extractTweetId, getChoiceLabel } from "../utils/proposalHelpers";
import { ExternalLink, Check } from "lucide-react";

interface TweetChoiceGridProps {
  choices: string[];
  selectedChoice: number | null;
  onSelect: (idx: number) => void;
  disabled: boolean;
  displayNames?: Map<string, string>;
}

const TweetSkeleton = () => (
  <div className="animate-pulse space-y-3 p-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-nasun-white/10 rounded-full" />
      <div className="space-y-1.5 flex-1">
        <div className="h-3 bg-nasun-white/10 rounded w-24" />
        <div className="h-2.5 bg-nasun-white/10 rounded w-16" />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 bg-nasun-white/10 rounded w-full" />
      <div className="h-3 bg-nasun-white/10 rounded w-4/5" />
      <div className="h-3 bg-nasun-white/10 rounded w-3/5" />
    </div>
  </div>
);

const TweetErrorFallback: FC<{ url: string }> = ({ url }) => (
  <div className="flex flex-col items-center justify-center p-6 min-h-[200px] text-center">
    <svg className="w-8 h-8 text-nasun-white/20 mb-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
    <p className="text-nasun-white/40 text-sm mb-2">Tweet unavailable</p>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-nasun-nw1 hover:text-nasun-nw2 flex items-center gap-1"
    >
      View on X <ExternalLink className="w-3 h-3" />
    </a>
  </div>
);

// Extracted outside component to avoid re-creation on every render
const TWEET_DARK_THEME_CSS = `
  .governance-tweet-card .react-tweet-theme {
    --tweet-container-background: transparent;
    --tweet-color-blue-primary: rgb(29, 155, 240);
    --tweet-color-hover: rgba(255, 255, 255, 0.1);
    --tweet-body-font-size: 14px;
    --tweet-body-line-height: 1.4;
    --tweet-container-border-radius: 0;
    --tweet-border-radius: 0;
    --tweet-border: none;
    --tweet-quoted-container-border: none;
    --tweet-quoted-border: none;
    --tweet-quoted-bg-color: rgba(15, 15, 25, 0.6);
    --tweet-quoted-bg-color-hover: rgba(15, 15, 15, 0.6);
    margin: 0 !important;
  }
  .governance-tweet-card .react-tweet-theme,
  .governance-tweet-card > div {
    border-radius: 0 !important;
    overflow: hidden !important;
  }
  .governance-tweet-card .react-tweet-theme > article,
  .governance-tweet-card > div > article {
    border: none !important;
    background: transparent !important;
    border-radius: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
  }
  .governance-tweet-card article > *:not(:has(article)),
  .governance-tweet-card article > *:not(:has(article)):hover {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
  .governance-tweet-card article article {
    border: none !important;
    background: transparent !important;
  }
  .governance-tweet-card article > p,
  .governance-tweet-card article > p * {
    font-size: 13px !important;
    line-height: 1.4 !important;
  }
  /* Truncate tweet text to ~3 lines with ellipsis */
  .governance-tweet-card article > p {
    display: -webkit-box !important;
    -webkit-line-clamp: 3 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  /* Prevent ALL links from navigating (card click = select) */
  .governance-tweet-card a,
  .governance-tweet-card article a,
  .governance-tweet-card article article a {
    pointer-events: none !important;
    cursor: pointer !important;
  }
  /* Only allow the X icon (top-right brand link) to be clickable */
  .governance-tweet-card > div > article > div:first-child a:last-child {
    pointer-events: auto !important;
  }
  /* Hide quoted tweets */
  .governance-tweet-card article > div:has(article) {
    display: none !important;
  }
`;

export const TweetChoiceGrid: FC<TweetChoiceGridProps> = ({
  choices,
  selectedChoice,
  onSelect,
  disabled,
  displayNames,
}) => {
  return (
    <>
      <style>{TWEET_DARK_THEME_CSS}</style>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
      >
        {choices.map((choice, idx) => {
          const tweetId = extractTweetId(choice);
          const isSelected = selectedChoice === idx;

          return (
            <div
              key={idx}
              className={`flex flex-col rounded-sm border-2 transition-all cursor-pointer ${
                isSelected
                  ? "border-nasun-nw1 bg-nasun-nw1/10 ring-2 ring-nasun-nw1/30 scale-[1.02]"
                  : "border-nasun-white/10 bg-gray-900/80 hover:border-nasun-white/25 opacity-80 hover:opacity-100"
              } ${disabled ? "!opacity-40 pointer-events-none" : ""}`}
              onClick={() => !disabled && onSelect(idx)}
            >
              {/* Tweet embed area with height limit */}
              <div className="max-h-[380px] overflow-hidden relative">
                <div className="governance-tweet-card" data-theme="dark">
                  {tweetId ? (
                    <SafeTweet
                      id={tweetId}
                      fallback={<TweetSkeleton />}
                      notFoundFallback={<TweetErrorFallback url={choice} />}
                    />
                  ) : (
                    <TweetErrorFallback url={choice} />
                  )}
                </div>
                {/* Gradient fade at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900/90 to-transparent pointer-events-none" />
              </div>

              {/* Selection indicator */}
              <div
                className={`flex items-center justify-center gap-3 px-4 py-3.5 border-t cursor-pointer transition-all ${
                  isSelected
                    ? "bg-nasun-c7 border-nasun-c7"
                    : "bg-nasun-nw5 border-nasun-nw5 hover:bg-nasun-c7/40"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onSelect(idx);
                }}
              >
                <div
                  className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-nasun-nw3 shadow-[0_0_6px_rgba(62,92,122,0.4)]"
                      : "border-2 border-nasun-nw3/50"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-nasun-white stroke-[3]" />}
                </div>
                <span className={`text-sm truncate font-semibold text-nasun-black`}>
                  {getChoiceLabel(choice, displayNames)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
