/**
 * UjuCreatorPostsCard
 *
 * Creator post submission section for UJU Activity.
 * Detached from myAccount dependencies.
 */

import { FC, useState, useMemo } from "react";
import { Spinner } from "@/components/ui";
import { useUserStore } from "@/store/userStore";
import {
  useMyCreatorPosts,
  useSubmitCreatorPost,
  STATUS_LABELS,
  displayStatus,
  ApiError,
  isLikelyTweetUrl,
  openPostUrlSafely,
  formatDate,
} from "@/features/creator-posts";
import { UjuCard, UjuSectionHeader, UjuButton } from "../../shared";

// Uju-native status colors
const UJU_STATUS_COLORS: Record<string, string> = {
  pending: "bg-pado-2/10 text-pado-2 border border-pado-2/20",
  granted: "bg-pado-4/10 text-pado-4 border border-pado-4/20",
  rejected: "bg-red-500/10 text-red-400 border border-red-500/20",
};

interface UjuCreatorPostsCardProps {
  className?: string;
}

export const UjuCreatorPostsCard: FC<UjuCreatorPostsCardProps> = ({
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
      onSuccess: () => {
        setPostUrl("");
        setSuccessMsg(
          `Submitted successfully.`,
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
            err.status === 400 &&
            err.payload.error === "cannot_resolve_author"
          ) {
            setErrorMsg(
              "Could not verify the author of this post. Please paste the full tweet URL (x.com/yourhandle/status/...) instead of the shortlink.",
            );
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
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Creator Posts"
        subtitle="Share posts about Nasun and earn points"
      />

      {!twitterLinked ? (
        <div className="p-4 rounded-xl bg-uju-bg/40 border border-uju-border/20 text-center">
          <p className="text-sm text-uju-secondary font-medium mb-3">
            Connect your X account to submit creator posts and earn ecosystem
            points.
          </p>
          <UjuButton variant="primary" size="sm" as="a" href="/my-account?tab=profile">
            Connect X Account
          </UjuButton>
        </div>
      ) : (
        <div className="space-y-4 mb-8 bg-uju-bg/30 p-5 rounded-2xl border border-uju-border/10">
          <p className="text-sm text-uju-secondary font-medium">
            Paste an X post URL you wrote about Nasun to earn points.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/..."
              className="flex-1 min-w-0 bg-uju-bg/80 border border-uju-border/30 rounded-xl px-4 py-2.5 text-sm text-uju-primary placeholder-uju-secondary/30 focus:outline-none focus:border-pado-2 focus:ring-1 focus:ring-pado-2/20 transition-all"
              disabled={submitMut.isPending}
            />
            <UjuButton
              onClick={handleSubmit}
              disabled={!canSubmit}
              variant="primary"
              className="justify-center sm:w-32"
            >
              {submitMut.isPending ? "Submitting..." : "Submit"}
            </UjuButton>
          </div>
          <p className="text-[10px] text-uju-secondary/60 font-bold uppercase tracking-widest">
            Helpful posts earn more points. Quality matters.
          </p>
          {errorMsg && <p className="text-sm font-bold text-red-400 mt-2">{errorMsg}</p>}
          {successMsg && <p className="text-sm font-bold text-pado-4 mt-2">{successMsg}</p>}
        </div>
      )}

      <div className="space-y-4">
        <h6 className="text-xs font-bold uppercase text-uju-secondary tracking-widest px-1">
          Recent Submissions
        </h6>
        {listQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : listQuery.isError ? (
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <p className="text-sm text-red-400 font-medium text-center">Failed to load submissions</p>
          </div>
        ) : allItems.length === 0 ? (
          <p className="text-sm text-uju-secondary font-medium italic px-1">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {allItems.slice(0, visibleCount).map((post) => {
              const ds = displayStatus(post.status).toLowerCase();
              const statusColorClass = UJU_STATUS_COLORS[ds] || UJU_STATUS_COLORS.pending;
              
              return (
                <div
                  key={post.postId}
                  className={`rounded-xl p-4 border transition-all duration-200 ${
                    post.status === "GRANTED"
                      ? "bg-pado-4/5 border-pado-4/40 shadow-[0_0_20px_rgba(134,243,183,0.05)]"
                      : "bg-uju-bg/40 border-uju-border/20 hover:border-pado-2/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => openPostUrlSafely(post.postUrl)}
                      className="text-sm text-pado-2 hover:text-pado-4 font-medium transition-colors truncate max-w-[65%] text-left"
                      title={post.postUrl}
                    >
                      {post.postUrl}
                    </button>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider whitespace-nowrap ${statusColorClass}`}
                      >
                        {STATUS_LABELS[displayStatus(post.status)]}
                      </span>
                      {post.status === "GRANTED" && post.scoredPoints != null && (
                        <span className="text-xs font-bold text-pado-4 tabular-nums">
                          +{post.scoredPoints} PTS
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-uju-secondary/80">
                      {formatDate(post.createdAt)}
                    </span>
                    {post.status === "REJECTED" && post.rejectionReason && (
                      <span className="text-xs text-red-400 font-medium italic truncate max-w-[60%]">
                        {post.rejectionReason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {(visibleCount < allItems.length ||
              listQuery.hasNextPage ||
              visibleCount > 3) && (
              <div className="flex justify-center gap-3 pt-4 border-t border-uju-border/10">
                {(visibleCount < allItems.length || listQuery.hasNextPage) && (
                  <UjuButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
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
                    className="min-w-[100px] justify-center"
                  >
                    {listQuery.isFetchingNextPage ? "Fetching..." : "Load More"}
                  </UjuButton>
                )}
                {visibleCount > 3 && (
                  <UjuButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setVisibleCount(3)}
                    className="min-w-[100px] justify-center"
                  >
                    Show Less
                  </UjuButton>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </UjuCard>
  );
};
