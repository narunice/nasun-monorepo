/**
 * CreatorPostsAdmin — admin page for Creator Posts Program.
 *
 * Review user-submitted X posts, score (1..30), reject, or grant points.
 * Grant is irrevocable and performs PG insert + DDB status transition.
 */

import { useMemo, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { OuterBox } from '@/components/ui/OuterBox';
import { PageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { toast } from 'react-toastify';
import {
  useAdminCreatorPosts,
  useScoreCreatorPost,
  useRejectCreatorPost,
  useGrantCreatorPost,
  STATUS_LABELS,
  STATUS_COLORS,
  ADMIN_STATUS_OPTIONS,
  POINTS_MIN,
  POINTS_MAX,
  safeImageUrl,
  isSafeHandle,
  formatDate,
  ApiError,
} from '@/features/creator-posts';
import type { CreatorPost, CreatorPostStatus } from '@/features/creator-posts';
import { TweetEmbed } from '../components/TweetEmbed';

const FALLBACK_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#334155"/><circle cx="20" cy="16" r="6" fill="#64748b"/><circle cx="20" cy="36" r="12" fill="#64748b"/></svg>',
  );

export function CreatorPostsAdmin() {
  const { user } = useAuth();
  const token = user?.cognitoToken;

  const [statusFilter, setStatusFilter] = useState<CreatorPostStatus>('PENDING');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([]);

  const listQuery = useAdminCreatorPosts(token, { status: statusFilter, cursor });

  const scoreMut = useScoreCreatorPost(token);
  const rejectMut = useRejectCreatorPost(token);
  const grantMut = useGrantCreatorPost(token);

  const items = listQuery.data?.items || [];

  const onFilterChange = (next: CreatorPostStatus) => {
    setStatusFilter(next);
    setCursor(undefined);
    setCursorStack([]);
  };

  const onNextPage = () => {
    const nextCursor = listQuery.data?.nextCursor;
    if (!nextCursor) return;
    setCursorStack((s) => [...s, cursor]);
    setCursor(nextCursor);
  };

  const onPrevPage = () => {
    if (cursorStack.length === 0) return;
    const prev = cursorStack[cursorStack.length - 1];
    setCursorStack((s) => s.slice(0, -1));
    setCursor(prev);
  };

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="w-full mb-6">
          <PageTitle as="h3" align="left" className="">
            Creator Posts
          </PageTitle>
          <p className="text-nasun-white/80 max-w-2xl -mt-6">
            Review user-submitted X posts. Score 1&ndash;{POINTS_MAX} per post, reject, or grant. Granting is irrevocable.
          </p>
        </div>

        <OuterBox color="c5" padding="md" className="w-full mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-white/70 mr-1">Status:</span>
            {ADMIN_STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onFilterChange(s)}
                className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
                  statusFilter === s
                    ? 'bg-nasun-c4/30 text-nasun-c4 border-nasun-c4/50'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </OuterBox>

        <OuterBox color="c5" padding="md" className="w-full">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : listQuery.isError ? (
            <p className="text-sm text-red-400">Failed to load posts</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-white/60 py-6 text-center">
              No {STATUS_LABELS[statusFilter].toLowerCase()} posts.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((post) => (
                <AdminPostRow
                  key={post.postId}
                  post={post}
                  onScore={(points) =>
                    scoreMut.mutateAsync(
                      { postId: post.postId, points },
                      {
                        onSuccess: () => toast.success(`Scored ${points} pts`),
                        onError: (e) => toast.error(mapError(e)),
                      },
                    )
                  }
                  onReject={(reason) =>
                    rejectMut.mutateAsync(
                      { postId: post.postId, reason },
                      {
                        onSuccess: () => toast.success('Rejected'),
                        onError: (e) => toast.error(mapError(e)),
                      },
                    )
                  }
                  onGrant={() =>
                    grantMut.mutateAsync(post.postId, {
                      onSuccess: (res) =>
                        toast.success(
                          res.duplicate ? 'Granted (was already credited)' : 'Granted',
                        ),
                      onError: (e) => toast.error(mapError(e)),
                    })
                  }
                  disabled={scoreMut.isPending || rejectMut.isPending || grantMut.isPending}
                />
              ))}
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button variant="outlineC5" size="sm" onClick={onPrevPage} disabled={cursorStack.length === 0}>
              Prev
            </Button>
            <Button
              variant="outlineC5" size="sm"
              onClick={onNextPage}
              disabled={!listQuery.data?.nextCursor}
            >
              Next
            </Button>
          </div>
        </OuterBox>
      </SectionLayout>
    </AdminLayout>
  );
}

function mapError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.payload.error === 'invalid_state') return 'Invalid state for this action.';
    if (err.payload.error === 'inconsistent_state') return 'Inconsistent state — check logs.';
    if (err.payload.error === 'explorer_unavailable') return 'Points service unavailable. Try again.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

// ============================================
// Row component
// ============================================

interface RowProps {
  post: CreatorPost;
  onScore: (points: number) => Promise<unknown>;
  onReject: (reason: string) => Promise<unknown>;
  onGrant: () => Promise<unknown>;
  disabled: boolean;
}

function AdminPostRow({ post, onScore, onReject, onGrant, disabled }: RowProps) {
  const [pointsInput, setPointsInput] = useState<string>(
    post.scoredPoints != null ? String(post.scoredPoints) : '',
  );
  const [savedPoints, setSavedPoints] = useState<number | undefined>(post.scoredPoints);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [grantPoints, setGrantPoints] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const avatarUrl = useMemo(
    () => safeImageUrl(post.twitterProfileImageUrl),
    [post.twitterProfileImageUrl],
  );
  const handleSafe = isSafeHandle(post.twitterHandle);
  const handleHref = handleSafe
    ? `https://x.com/${encodeURIComponent(post.twitterHandle)}`
    : null;

  // Safe post URL — validated host+scheme before binding to anchor.
  const safePostHref = useMemo(() => {
    try {
      const u = new URL(post.postUrl);
      if (u.protocol !== 'https:') return null;
      if (!['x.com', 'twitter.com'].includes(u.host)) return null;
      return u.toString();
    } catch {
      return null;
    }
  }, [post.postUrl]);

  const canEditPoints = post.status === 'PENDING' || post.status === 'SCORED';
  const canReject = canEditPoints;

  // Save click: validate and open Grant confirmation modal directly.
  const handleSaveClick = () => {
    const n = parseInt(pointsInput, 10);
    if (!Number.isInteger(n) || n < POINTS_MIN || n > POINTS_MAX) {
      toast.error(`Points must be ${POINTS_MIN}-${POINTS_MAX}`);
      return;
    }
    setGrantPoints(n);
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Reason is required');
      return;
    }
    await onReject(reason);
    setShowReject(false);
  };

  // Grant confirm: score (if needed) then grant, chained.
  const handleGrantConfirm = async () => {
    if (grantPoints == null) return;
    try {
      if (post.status === 'PENDING' || savedPoints !== grantPoints) {
        await onScore(grantPoints);
        setSavedPoints(grantPoints);
      }
      await onGrant();
    } finally {
      setGrantPoints(null);
    }
  };

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 space-y-2">
      {/* Row 1: Identity + post URL */}
      <div className="flex items-start gap-3">
        <img
          src={avatarUrl || FALLBACK_AVATAR}
          alt=""
          className="w-10 h-10 rounded-full bg-slate-700 shrink-0"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = FALLBACK_AVATAR;
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {handleHref ? (
              <a
                href={handleHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-nasun-c4 hover:underline"
              >
                @{post.twitterHandle}
              </a>
            ) : (
              <span className="text-sm text-white/60">
                @{post.twitterHandle}
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[post.status]}`}
            >
              {STATUS_LABELS[post.status]}
            </span>
            {savedPoints != null && post.status !== 'REJECTED' && (
              <span className="text-xs text-green-400 font-mono">
                {savedPoints} pts
              </span>
            )}
            <span className="text-xs text-white/40">{formatDate(post.createdAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {safePostHref ? (
              <a
                href={safePostHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-nasun-c4 hover:underline break-all"
              >
                {post.postUrl}
              </a>
            ) : (
              <span className="text-xs text-white/70 break-all">{post.postUrl}</span>
            )}
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-xs text-nasun-c4 hover:underline shrink-0"
            >
              {showPreview ? 'Hide preview' : 'Preview'}
            </button>
          </div>
        </div>
      </div>

      {/* Tweet preview (X widgets.js embed) */}
      {showPreview && <TweetEmbed tweetId={post.postId} />}

      {/* Rejection reason (when rejected) */}
      {post.status === 'REJECTED' && post.rejectionReason && (
        <p className="text-xs text-red-300/80 italic border-l-2 border-red-500/30 pl-2">
          {post.rejectionReason}
        </p>
      )}

      {/* Row 2: Actions (hidden when terminal) */}
      {canEditPoints && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <input
            type="number"
            min={POINTS_MIN}
            max={POINTS_MAX}
            value={pointsInput}
            onChange={(e) => setPointsInput(e.target.value)}
            placeholder={`${POINTS_MIN}-${POINTS_MAX}`}
            disabled={disabled}
            className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50"
          />
          <Button
            variant="c4" size="sm"
            onClick={handleSaveClick}
            disabled={disabled || !pointsInput}
          >
            Save
          </Button>
          {canReject && (
            <button
              type="button"
              onClick={() => setShowReject(true)}
              disabled={disabled}
              className="ml-auto text-xs text-white/40 hover:text-red-400 disabled:opacity-30 disabled:hover:text-white/40"
              title="Reject this post"
            >
              Reject
            </button>
          )}
        </div>
      )}

      {/* Reject modal (inline) */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800 rounded-lg p-4 w-[90%] max-w-md space-y-3">
            <h4 className="text-nasun-white font-medium">Reject post</h4>
            <p className="text-xs text-white/60">
              This reason will be shown to the user.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outlineC5" size="sm"
                onClick={() => {
                  setShowReject(false);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button variant="c4" size="sm" onClick={handleReject} disabled={disabled}>
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Grant confirm modal (inline) */}
      {grantPoints != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800 rounded-lg p-4 w-[90%] max-w-md space-y-3">
            <h4 className="text-nasun-white font-medium">Confirm grant</h4>
            <div className="flex items-center gap-3 border border-white/10 rounded-lg p-2">
              <img
                src={avatarUrl || FALLBACK_AVATAR}
                alt=""
                className="w-10 h-10 rounded-full bg-slate-700 shrink-0"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = FALLBACK_AVATAR;
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">@{post.twitterHandle}</p>
                <p className="text-xs text-white/60 break-all">{post.postUrl}</p>
              </div>
              <span className="text-base font-mono text-green-400 shrink-0">
                +{grantPoints} pts
              </span>
            </div>
            <p className="text-xs text-red-300">
              Grant is irrevocable. Points cannot be taken back.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outlineC5" size="sm"
                onClick={() => setGrantPoints(null)}
                disabled={disabled}
              >
                Cancel
              </Button>
              <Button
                variant="c4" size="sm"
                onClick={handleGrantConfirm}
                disabled={disabled}
              >
                Grant
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
