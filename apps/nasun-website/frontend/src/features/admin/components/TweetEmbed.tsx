import { FC } from 'react';
import { SafeTweet } from '@/components/SafeTweet';

interface TweetEmbedProps {
  tweetId: string;
}

/**
 * Embed a single tweet by ID. Uses `SafeTweet` so that upstream
 * react-tweet API quirks (e.g. omitted empty entity arrays) do not
 * crash the page.
 */
export const TweetEmbed: FC<TweetEmbedProps> = ({ tweetId }) => {
  const tweetUrl = `https://x.com/i/status/${encodeURIComponent(tweetId)}`;
  return (
    <div data-theme="dark">
      <SafeTweet
        id={tweetId}
        notFoundFallback={
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-nasun-c4 hover:underline py-2"
          >
            Preview unavailable. Open on X &rarr;
          </a>
        }
      />
    </div>
  );
};
