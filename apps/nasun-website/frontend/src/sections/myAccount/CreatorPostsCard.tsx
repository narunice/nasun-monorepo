/**
 * CreatorPostsCard
 *
 * Standing program: user submits X post URLs → admin scores → admin grants points.
 * GRANTED points go to ecosystem-bonus-creator-posts category (irrevocable).
 */

import { FC, useState, useMemo } from "react";
import { OuterBox, Spinner } from "@/components/ui";
import { useUserStore } from "@/store/userStore";
import {
  useMyCreatorPosts,
  useSubmitCreatorPost,
  STATUS_LABELS,
  STATUS_COLORS,
  displayStatus,
  ApiError,
  isLikelyTweetUrl,
  openPostUrlSafely,
  formatDate,
} from "@/features/creator-posts";

interface CreatorPostsCardProps {
  className?: string;
}

export const CreatorPostsCard: FC<CreatorPostsCardProps> = ({
  className = "",
}) => {
  const user = useUserStore((s) => s.user);
  const cognitoToken = user?.cognitoToken;
  const twitterLinked =
    !!user?.twitterHandle || !!user?.linkedAccounts?.twitter?.twitterHandle;

  const [postUrl, setPostUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);

  const submitMut = useSubmitCreatorPost(cognitoToken);
  const listQuery = useMyCreatorPosts(cognitoToken);

  const allItems = useMemo(
    () => (listQuery.data?.pages || []).flatMap((p) => p.items),
    [listQuery.data],
  );

  if (!import.meta.env.VITE_BUG_REPORT_API_URL) return null;
  if (!cognitoToken) return null;

  const canSubmit =
    twitterLinked && isLikelyTweetUrl(postUrl) && !submitMut.isPending;

  const handleSubmit = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    submitMut.mutate(postUrl.trim(), {
      onSuccess: (res) => {
        setPostUrl("");
        setSuccessMsg(
          `Submitted. Remaining today: ${res.remainingToday}/${res.dailyLimit}.`,
        );
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          if (err.status === 400 && err.payload.error === "handle_mismatch") {
            setErrorMsg(
              "The URL handle does not match your connected X account. Only your own posts can be submitted.",
            );
            return;
          }
          if (
            err.status === 400 &&
            err.payload.error === "twitter_not_linked"
          ) {
            setErrorMsg("Connect your X account first.");
            return;
          }
          if (err.status === 400 && err.payload.error === "invalid_url") {
            setErrorMsg("Not a valid X post URL.");
            return;
          }
          if (
            err.status === 429 &&
            err.payload.error === "daily_limit_reached"
          ) {
            setErrorMsg(`Daily limit reached. Limit resets at UTC midnight.`);
            return;
          }
          if (err.status === 409 && err.payload.error === "already_submitted") {
            setErrorMsg("This post has already been submitted.");
            return;
          }
          setErrorMsg(err.message);
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : "Submission failed");
      },
    });
  };

  return (
    <OuterBox color="w2" padding="sm" className={className}>
      <h5 className="font-medium uppercase text-nasun-white mb-3">
        Creator Posts
      </h5>

      {!twitterLinked ? (
        <p className="text-sm text-white/70">
          Connect your X account to submit creator posts and earn ecosystem
          points.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-white/70">
            Submit an X post URL you wrote about Nasun and earn points.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="url"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/1234567890123456789"
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50"
              disabled={submitMut.isPending}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30 rounded-lg hover:bg-nasun-c4/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitMut.isPending ? "Submitting..." : "Submit"}
            </button>
          </div>
          <p className="text-sm text-white/70">One post a day</p>
          {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
          {successMsg && <p className="text-sm text-green-400">{successMsg}</p>}
        </div>
      )}

      <div className="mt-4">
        <h6 className="text-sm uppercase text-white/80 mb-2">
          Your Submissions
        </h6>
        {listQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : listQuery.isError ? (
          <p className="text-sm text-red-400">Failed to load submissions</p>
        ) : allItems.length === 0 ? (
          <p className="text-sm text-white/80">No submissions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {allItems.slice(0, visibleCount).map((post) => (
              <div
                key={post.postId}
                className={`rounded-lg bg-white/[0.08] p-2.5 border ${
                  post.status === "GRANTED"
                    ? "border-green-500/60 !bg-green-500/10"
                    : "border-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => openPostUrlSafely(post.postUrl)}
                    className="text-sm text-blue-400 hover:underline truncate max-w-[60%]"
                    title={post.postUrl}
                  >
                    {post.postUrl}
                  </button>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const ds = displayStatus(post.status);
                      return (
                        <span
                          className={`text-sm px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[ds]}`}
                        >
                          {STATUS_LABELS[ds]}
                        </span>
                      );
                    })()}
                    {post.status === "GRANTED" && post.scoredPoints != null && (
                      <span className="text-sm text-green-400 font-mono">
                        +{post.scoredPoints} pts
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
                  <span className="text-sm text-white/80">
                    {formatDate(post.createdAt)}
                  </span>
                  {post.status === "REJECTED" && post.rejectionReason && (
                    <span className="text-sm text-red-300/80 italic">
                      {post.rejectionReason}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(visibleCount < allItems.length ||
              listQuery.hasNextPage ||
              visibleCount > 3) && (
              <div className="flex justify-center gap-2 mt-2">
                {(visibleCount < allItems.length || listQuery.hasNextPage) && (
                  <button
                    type="button"
                    onClick={() => {
                      // If we already have more fetched items, reveal them first.
                      // Otherwise fetch the next backend page.
                      if (visibleCount < allItems.length) {
                        setVisibleCount((c) => c + 3);
                      } else if (
                        listQuery.hasNextPage &&
                        !listQuery.isFetchingNextPage
                      ) {
                        listQuery.fetchNextPage();
                        setVisibleCount((c) => c + 3);
                      }
                    }}
                    disabled={listQuery.isFetchingNextPage}
                    className="px-3 py-1 text-sm text-white/70 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-40"
                  >
                    {listQuery.isFetchingNextPage ? "Loading..." : "Load more"}
                  </button>
                )}
                {visibleCount > 3 && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(3)}
                    className="px-3 py-1 text-sm text-white/70 hover:text-white border border-white/10 rounded-lg hover:bg-white/5"
                  >
                    Show less
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </OuterBox>
  );
};
