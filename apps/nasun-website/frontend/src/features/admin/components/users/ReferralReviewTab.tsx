/**
 * Admin tab: review referrals across PENDING / APPEALED / DECLINED.
 *
 * Pending tab shows per-row Approve/Decline with a stable serial number by
 * applied date (oldest = #1). Decline requires a reviewer note that is shown
 * to the user. Appealed tab shows the user's appeal text and lets the admin
 * Reverse (approve) or Reconfirm the decline. Declined tab is read-only.
 */

import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import {
  listReferralReview,
  approveReferral,
  declineReferral,
  resolveAppeal,
  type ReviewItem,
  type ReviewStatus,
} from "@/services/referralApi";

type RowStatus = "idle" | "pending" | "done" | "declined" | "reversed" | "reconfirmed" | "error";

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export const ReferralReviewTab: FC = () => {
  const { cognitoToken } = useAdminAuth();
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowStatus>>({});
  const [search, setSearch] = useState("");

  // Decline modal
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  // Appeal resolution modal
  const [appealFor, setAppealFor] = useState<ReviewItem | null>(null);
  const [resolverNote, setResolverNote] = useState("");
  const [resolverAction, setResolverAction] = useState<"reverse" | "reconfirm" | null>(null);

  const reload = useCallback(async (status: ReviewStatus) => {
    if (!cognitoToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listReferralReview(cognitoToken, status);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    setRowState({});
    void reload(tab);
  }, [tab, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((it) =>
      (it.twitterHandle || "").toLowerCase().includes(q) ||
      (it.referrerHandle || "").toLowerCase().includes(q) ||
      (it.referralCode || "").toLowerCase().includes(q) ||
      it.referredIdentityId.toLowerCase().includes(q),
    );
  }, [items, search]);

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
    const note = declineNote.trim();
    if (note.length < 10) {
      alert("Reviewer note must be at least 10 characters.");
      return;
    }
    if (note.length > 500) {
      alert("Reviewer note must be at most 500 characters.");
      return;
    }
    const id = declineFor;
    setRowState((p) => ({ ...p, [id]: "pending" }));
    try {
      await declineReferral(cognitoToken, id, note);
      setRowState((p) => ({ ...p, [id]: "declined" }));
      setDeclineFor(null);
      setDeclineNote("");
    } catch {
      setRowState((p) => ({ ...p, [id]: "error" }));
    }
  }, [cognitoToken, declineFor, declineNote]);

  const onResolve = useCallback(async () => {
    if (!cognitoToken || !appealFor || !resolverAction) return;
    const id = appealFor.referredIdentityId;
    setRowState((p) => ({ ...p, [id]: "pending" }));
    try {
      await resolveAppeal(cognitoToken, id, resolverAction, resolverNote.trim() || undefined);
      setRowState((p) => ({ ...p, [id]: resolverAction === "reverse" ? "reversed" : "reconfirmed" }));
      setAppealFor(null);
      setResolverNote("");
      setResolverAction(null);
    } catch {
      setRowState((p) => ({ ...p, [id]: "error" }));
    }
  }, [cognitoToken, appealFor, resolverAction, resolverNote]);

  const TabBtn: FC<{ value: ReviewStatus; label: string }> = ({ value, label }) => (
    <button
      onClick={() => setTab(value)}
      className={
        "px-3 py-1.5 rounded-t text-sm " +
        (tab === value
          ? "bg-nasun-white/10 text-nasun-white border-b-2 border-emerald-400"
          : "text-nasun-white/60 hover:text-nasun-white")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-nasun-white/10">
        <TabBtn value="pending" label="Pending" />
        <TabBtn value="appealed" label="Appealed" />
        <TabBtn value="declined" label="Declined" />
        <div className="ml-auto pb-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search handle / code…"
            className="bg-nasun-white/5 border border-nasun-white/20 rounded px-2 py-1 text-sm text-nasun-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-nasun-white/70">Loading…</div>
      ) : error ? (
        <div className="py-4 text-rose-400">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-nasun-white/70">
          {tab === "pending" ? "No pending referrals." : tab === "appealed" ? "No appeals waiting." : "No declined referrals."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-nasun-white/60 border-b border-nasun-white/10">
                <th className="py-2 pr-3 w-12">#</th>
                <th className="py-2 pr-3">Referee</th>
                <th className="py-2 pr-3">X</th>
                <th className="py-2 pr-3">Referrer</th>
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Signed up</th>
                {tab === "appealed" && <th className="py-2 pr-3">Appeal</th>}
                {tab === "declined" && <th className="py-2 pr-3">Reason</th>}
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const s = rowState[it.referredIdentityId] || "idle";
                const done = s === "done" || s === "declined" || s === "reversed" || s === "reconfirmed";
                return (
                  <tr key={it.referredIdentityId} className="border-b border-nasun-white/5 align-top">
                    <td className="py-2 pr-3 text-nasun-white font-semibold">{it.serial}</td>
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
                    <td className="py-2 pr-3 font-mono text-nasun-white/70">{it.referralCode || "-"}</td>
                    <td className="py-2 pr-3 text-nasun-white/70 font-mono text-xs whitespace-nowrap">
                      {formatDateTime(it.appliedAt)}
                    </td>
                    {tab === "appealed" && (
                      <td className="py-2 pr-3 text-nasun-white/80 max-w-xs">
                        <div className="line-clamp-3 text-xs">{it.appealText}</div>
                        <div className="text-[11px] text-nasun-white/50 mt-1">
                          {formatDateTime(it.appealedAt)}
                        </div>
                      </td>
                    )}
                    {tab === "declined" && (
                      <td className="py-2 pr-3 text-nasun-white/80 max-w-xs">
                        <div className="line-clamp-3 text-xs">{it.reviewerNote || "-"}</div>
                        <div className="text-[11px] text-nasun-white/50 mt-1">
                          {formatDateTime(it.reviewedAt)}
                          {it.appealResolution === "reconfirmed" && " · appeal reconfirmed"}
                        </div>
                      </td>
                    )}
                    <td className="py-2">
                      {done ? (
                        <span className={"text-xs " + (s === "done" || s === "reversed" ? "text-emerald-400" : "text-amber-400")}>
                          {s === "done" ? "Approved" : s === "reversed" ? "Reversed" : s === "reconfirmed" ? "Reconfirmed" : "Declined"}
                        </span>
                      ) : tab === "pending" ? (
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
                      ) : tab === "appealed" ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setAppealFor(it); setResolverAction("reverse"); setResolverNote(""); }}
                            disabled={s === "pending"}
                            className="px-2 py-1 rounded bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-200 text-xs"
                          >
                            Reverse
                          </button>
                          <button
                            onClick={() => { setAppealFor(it); setResolverAction("reconfirm"); setResolverNote(""); }}
                            disabled={s === "pending"}
                            className="px-2 py-1 rounded bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 text-xs"
                          >
                            Reconfirm
                          </button>
                          {s === "error" && <span className="text-rose-400 text-xs">Failed</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-nasun-white/50">Read-only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-xs text-nasun-white/50 pt-2">
            Total: {items.length} · Shown: {filtered.length}
          </div>
        </div>
      )}

      {declineFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-nasun-c6 border border-nasun-white/20 rounded p-5 w-full max-w-md">
            <h3 className="text-lg font-semibold text-nasun-white mb-2">Decline referral</h3>
            <p className="text-sm text-nasun-white/80 mb-3">
              The reason will be shown to the user and the user enters a 30-day
              cooldown. The user may submit an appeal once.
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              placeholder="Reason (10-500 chars, shown to the user)"
              rows={4}
              maxLength={500}
              className="w-full bg-nasun-white/5 border border-nasun-white/20 rounded px-2 py-1.5 text-sm text-nasun-white"
            />
            <div className="flex items-center justify-between gap-2 mt-3">
              <span className="text-xs text-nasun-white/50">{declineNote.trim().length}/500</span>
              <div className="flex gap-2">
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
        </div>
      )}

      {appealFor && resolverAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-nasun-c6 border border-nasun-white/20 rounded p-5 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-nasun-white mb-2">
              {resolverAction === "reverse" ? "Reverse decline (approve)" : "Reconfirm decline"}
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-nasun-white/60 text-xs">Referee</div>
                <div className="text-nasun-white">
                  {appealFor.twitterHandle ? `@${appealFor.twitterHandle}` : appealFor.referredIdentityId.slice(0, 14) + "…"}
                </div>
              </div>
              <div>
                <div className="text-nasun-white/60 text-xs">Original decline reason · {formatDateTime(appealFor.reviewedAt)}</div>
                <div className="text-nasun-white/90 whitespace-pre-wrap">{appealFor.reviewerNote || "-"}</div>
              </div>
              <div>
                <div className="text-nasun-white/60 text-xs">User appeal · {formatDateTime(appealFor.appealedAt)}</div>
                <div className="text-nasun-white/90 whitespace-pre-wrap">{appealFor.appealText || "-"}</div>
              </div>
              <textarea
                value={resolverNote}
                onChange={(e) => setResolverNote(e.target.value)}
                placeholder="Optional internal resolver note (<=500 chars)"
                rows={3}
                maxLength={500}
                className="w-full bg-nasun-white/5 border border-nasun-white/20 rounded px-2 py-1.5 text-sm text-nasun-white"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setAppealFor(null); setResolverNote(""); setResolverAction(null); }}
                className="px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => void onResolve()}
                className={
                  "px-3 py-1.5 rounded text-white text-sm " +
                  (resolverAction === "reverse" ? "bg-emerald-500/40 hover:bg-emerald-500/60" : "bg-rose-500/40 hover:bg-rose-500/60")
                }
              >
                {resolverAction === "reverse" ? "Approve (reverse)" : "Confirm decline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
