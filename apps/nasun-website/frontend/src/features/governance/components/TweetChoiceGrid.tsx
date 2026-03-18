import { FC, useState } from "react";
import { Tweet } from "react-tweet";
import { extractTweetId, getChoiceLabel } from "../utils/proposalHelpers";
import { ExternalLink } from "lucide-react";

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
  .governance-tweet-card [data-testid="tweetText"],
  .governance-tweet-card [data-testid="tweetText"] * {
    font-size: 13px !important;
    line-height: 1.4 !important;
  }
`;

export const TweetChoiceGrid: FC<TweetChoiceGridProps> = ({
  choices,
  selectedChoice,
  onSelect,
  disabled,
  displayNames,
}) => {
  const [errorIds, setErrorIds] = useState<Set<number>>(new Set());

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
          const hasError = errorIds.has(idx);

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
              <div className="max-h-[400px] overflow-hidden relative">
                <div className="governance-tweet-card" data-theme="dark">
                  {tweetId && !hasError ? (
                    <Tweet
                      id={tweetId}
                      fallback={<TweetSkeleton />}
                      onError={() => setErrorIds((prev) => new Set(prev).add(idx))}
                    />
                  ) : (
                    <TweetErrorFallback url={choice} />
                  )}
                </div>
                {/* Gradient fade at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900/90 to-transparent pointer-events-none" />
              </div>

              {/* View on X link */}
              <a
                href={choice}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-nasun-white/30 hover:text-nasun-nw1 flex items-center gap-1 px-3 py-1.5 border-t border-nasun-white/5"
                onClick={(e) => e.stopPropagation()}
              >
                View on X <ExternalLink className="w-3 h-3" />
              </a>

              {/* Radio button */}
              <label
                className={`flex items-center gap-2.5 px-3 py-3 border-t cursor-pointer transition-colors ${
                  isSelected
                    ? "border-nasun-nw1/40 bg-nasun-nw1/15"
                    : "border-nasun-white/5 hover:bg-nasun-white/5"
                }`}
              >
                <input
                  type="radio"
                  name="tweet-choice"
                  checked={isSelected}
                  onChange={() => onSelect(idx)}
                  disabled={disabled}
                  className="accent-nasun-nw1 w-4 h-4 flex-shrink-0"
                />
                <span className={`text-sm truncate ${isSelected ? "text-nasun-nw1 font-medium" : "text-nasun-white/70"}`}>
                  {getChoiceLabel(choice, displayNames)}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </>
  );
};
