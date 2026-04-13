import { FC } from 'react';
import { Tweet } from 'react-tweet';

interface TweetEmbedProps {
  tweetId: string;
}

/**
 * Embed a single tweet by ID using `react-tweet` (Vercel's zero-JS embed).
 * Relies on the built-in tweet card styling; no outer wrapper to avoid
 * double-box nesting when rendered inside another container.
 */
export const TweetEmbed: FC<TweetEmbedProps> = ({ tweetId }) => {
  return (
    <div data-theme="dark">
      <Tweet id={tweetId} />
    </div>
  );
};
