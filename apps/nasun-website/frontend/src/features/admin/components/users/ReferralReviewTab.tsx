/**
 * Admin tab: per-row review of PENDING referrals.
 *
 * Per-row Approve/Decline (no bulk) preserves the manual @Nasun_io follow
 * verification intent — admin must look at each user. Decline opens an inline
 * note input + confirms before deletion (decline = row delete + 30-day
 * cooldown on the user, sets lastReferralDeclinedAt).
 */

import { FC, useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import {
  listReferralReview,
  approveReferral,
  declineReferral,
  type ReviewItem,
} from "@/services/referralApi";

type RowStatus = "idle" | "pending" | "done" | "declined" | "error";

const PAGE_SIZE = 20;

export const ReferralReviewTab: FC = () => {
  const { cognitoToken } = useAdminAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  // Cursor history: cursors[i] is the cursor used to fetch page i.
  // cursors[0] === undefined (first page has no cursor).
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowStatus>>({});
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const loadPage = useCallback(async (cursor: string | undefined) => {
    if (!cognitoToken) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await listReferralReview(cognitoToken, cursor, PAGE_SIZE);
      setItems(res.items);
      setNextCursor(res.nextCursor);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review queue");
      return null;
    } finally {
      setLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    if (!cognitoToken) return;
    setCursors([undefined]);
    setPageIndex(0);
    void loadPage(undefined);
  }, [cognitoToken, loadPage]);

  const onNext = useCallback(async () => {
    if (!nextCursor) return;
    const next = nextCursor;
    const res = await loadPage(next);
    if (res) {
      setCursors((prev) => {
        const copy = [...prev];
        copy[pageIndex + 1] = next;
        return copy;
      });
      setPageIndex((p) => p + 1);
    }
  }, [nextCursor, loadPage, pageIndex]);

  const onPrev = useCallback(async () => {
    if (pageIndex === 0) return;
    const prevIdx = pageIndex - 1;
    const res = await loadPage(cursors[prevIdx]);
    if (res) setPageIndex(prevIdx);
  }, [pageIndex, cursors, loadPage]);

  const onApprove = useCallback(async (id: string) => {
    if (!cognitoToken) return;
    setRowState((p) => ({ ...p, [id]: "pending" }));
    try {
      await approveReferral(cognitoToken, id);
      setRowState((p) => ({ ...p, [id]: "done" }));
    } catch {
      setRowState((p) => ({ ...p, [id]: "error" }));
    }
  }, [cognitoToken]);

  const onDecline = useCallback(async () => {
    if (!cognitoToken || !declineFor) return;
    if (!declineNote.trim()) {
      alert("Reviewer note is required for decline.");
      return;
    }
    const id = declineFor;
    setRowState((p) => ({ ...p, [id]: "pending" }));
    try {
      await declineReferral(cognitoToken, id, declineNote.trim());
      setRowState((p) => ({ ...p, [id]: "declined" }));
      setDeclineFor(null);
      setDeclineNote("");
    } catch {
      setRowState((p) => ({ ...p, [id]: "error" }));
    }
  }, [cognitoToken, declineFor, declineNote]);

  if (loading) return <div className="py-8 text-center text-nasun-white/70">Loading...</div>;
  if (error) return <div className="py-4 text-rose-400">{error}</div>;
  if (items.length === 0 && pageIndex === 0) return <div className="py-8 text-center text-nasun-white/70">No pending referrals.</div>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-nasun-white/60 border-b border-nasun-white/10">
              <th className="py-2 pr-3">Referee</th>
              <th className="py-2 pr-3">X</th>
              <th className="py-2 pr-3">Referrer</th>
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Applied</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const s = rowState[it.referredIdentityId] || "idle";
              const done = s === "done" || s === "declined";
              return (
                <tr key={it.referredIdentityId} className="border-b border-nasun-white/5 align-top">
                  <td className="py-2 pr-3 text-nasun-white">
                    {it.twitterHandle ? `@${it.twitterHandle}` : it.referredIdentityId.slice(0, 14) + "…"}
                  </td>
                  <td className="py-2 pr-3">
                    {it.twitterLinked ? (
                      <a
                        href={`https://x.com/${it.twitterHandle || ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-amber-400">Missing</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-nasun-white/80">
                    {it.referrerHandle ? `@${it.referrerHandle}` : it.referrerIdentityId.slice(0, 10) + "…"}
                  </td>
                  <td className="py-2 pr-3 font-mono text-nasun-white/70">{it.referralCode || "—"}</td>
                  <td className="py-2 pr-3 text-nasun-white/70">
                    {it.appliedAt
                      ? new Date(it.appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </td>
                  <td className="py-2">
                    {done ? (
                      <span className={"text-xs " + (s === "done" ? "text-emerald-400" : "text-amber-400")}>
                        {s === "done" ? "Approved" : "Declined"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onApprove(it.referredIdentityId)}
                          disabled={s === "pending" || !it.twitterLinked}
                          title={!it.twitterLinked ? "X must be linked before approval" : undefined}
                          className="px-2 py-1 rounded bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => { setDeclineFor(it.referredIdentityId); setDeclineNote(""); }}
                          disabled={s === "pending"}
                          className="px-2 py-1 rounded bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 text-xs"
                        >
                          Decline
                        </button>
                        {s === "error" && <span className="text-rose-400 text-xs">Failed</span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="text-xs text-nasun-white/60">
          Page {pageIndex + 1} · {items.length} item{items.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onPrev()}
            disabled={loading || pageIndex === 0}
            className="px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            onClick={() => void onNext()}
            disabled={loading || !nextCursor}
            className="px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Decline confirmation modal */}
      {declineFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-nasun-c6 border border-nasun-white/20 rounded p-5 w-full max-w-md">
            <h3 className="text-lg font-semibold text-nasun-white mb-2">
              Decline referral
            </h3>
            <p className="text-sm text-nasun-white/80 mb-3">
              The referral row will be deleted and the user enters a 30-day
              cooldown before re-applying.
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              placeholder="Reason (visible only to admins via CloudWatch)"
              rows={3}
              className="w-full bg-nasun-white/5 border border-nasun-white/20 rounded px-2 py-1.5 text-sm text-nasun-white"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setDeclineFor(null); setDeclineNote(""); }}
                className="px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => void onDecline()}
                className="px-3 py-1.5 rounded bg-rose-500/40 hover:bg-rose-500/60 text-white text-sm"
              >
                Confirm decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
