/**
 * UjuBugReportsCard Component
 *
 * Bug report section for UJU Activity.
 * Detached from myAccount dependencies.
 */

import { FC, useState, lazy, Suspense } from "react";
import { Spinner } from "@/components/ui";
import {
  useMyBugReports,
  useReplyToBugReport,
  BugReportReplyError,
} from "@/features/bug-report/hooks/useBugReport";
import type { BugReport } from "@/features/bug-report/types";
import { STATUS_LABELS } from "@/features/bug-report/types";
import { UjuCard, UjuSectionHeader, UjuButton } from "../../shared";

const REPLY_MAX_LENGTH = 1000;
const REPLY_ALLOWED_STATUSES: Array<BugReport["status"]> = [
  "fixed",
  "wont-fix",
];

const BugReportModal = lazy(
  () => import("@/features/bug-report/components/BugReportModal"),
);

// Uju-native status colors
const UJU_STATUS_COLORS: Record<BugReport["status"], string> = {
  new: "bg-pado-2/10 text-pado-2 border border-pado-2/20",
  investigating: "bg-amber-400/10 text-amber-300 border border-amber-400/20",
  "in-progress": "bg-blue-400/10 text-blue-300 border border-blue-400/20",
  fixed: "bg-pado-4/10 text-pado-4 border border-pado-4/20",
  accepted: "bg-pado-4/10 text-pado-4 border border-pado-4/20",
  "wont-fix": "bg-rose-400/10 text-rose-300 border border-rose-400/20",
  declined: "bg-rose-400/10 text-rose-300 border border-rose-400/20",
  duplicate: "bg-uju-secondary/10 text-uju-primary/80 border border-uju-secondary/30",
};

interface UjuBugReportsCardProps {
  className?: string;
}

export const UjuBugReportsCard: FC<UjuBugReportsCardProps> = ({ className = "" }) => {
  const { data: reports, isLoading, error } = useMyBugReports();
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (!import.meta.env.VITE_BUG_REPORT_API_URL) return null;

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Bug Reports & Feedback"
        subtitle="Reports you've submitted to the team"
        trailing={
          <UjuButton size="sm" variant="primary" onClick={() => setModalOpen(true)}>
            Submit Report
          </UjuButton>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
          <p className="text-sm text-red-400 font-light text-center">Failed to load reports</p>
        </div>
      ) : !reports || reports.length === 0 ? (
        <div className="flex flex-col items-center py-8 bg-uju-bg/30 rounded-xl border border-uju-border/10">
          <p className="text-base text-uju-secondary text-center px-6">
            No submissions yet. Found a bug or have feedback? Share it and earn points!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const isExpanded = selectedReport?.reportId === report.reportId;
            return (
              <div
                key={report.reportId}
                className={`rounded-xl border transition-all duration-200 ${
                  isExpanded 
                    ? "bg-uju-bg/60 border-pado-2/40" 
                    : "bg-uju-bg/30 border-uju-border/20 hover:border-pado-2/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelectedReport(isExpanded ? null : report)
                  }
                  className="w-full text-left p-4"
                >
                  <div
                    className={`flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-3 ${
                      isExpanded ? "sm:items-start" : "sm:items-center"
                    }`}
                  >
                    <span
                      className={`text-base font-normal text-uju-primary flex-1 break-words ${
                        isExpanded ? "sm:whitespace-normal" : "sm:truncate"
                      }`}
                      title={isExpanded ? undefined : report.title}
                    >
                      {report.title}
                    </span>
                    <span
                      className={`text-sm font-normal px-2 py-0.5 rounded-lg uppercase tracking-wider whitespace-nowrap self-start sm:self-auto ${UJU_STATUS_COLORS[report.status]}`}
                    >
                      {STATUS_LABELS[report.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-sm font-normal text-uju-secondary">
                      {new Date(report.timestamp).toLocaleDateString("en-US", {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-uju-border/30" />
                    <span className="text-sm font-normal text-pado-2 uppercase tracking-wide">
                      {report.category}
                    </span>
                    {report.bonusPoints != null && report.bonusPoints > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-uju-border/30" />
                        <span className="text-sm font-normal text-pado-4">
                          +{report.bonusPoints} PTS
                        </span>
                      </>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 space-y-4 animate-fade-in">
                    <div className="pt-4 border-t border-uju-border/10">
                      <span className="text-sm font-normal text-uju-secondary uppercase tracking-widest block mb-2">
                        Description
                      </span>
                      <p className="text-sm text-uju-primary leading-relaxed whitespace-pre-wrap">
                        {report.description}
                      </p>
                    </div>
                    {report.adminNote && (
                      <div className="p-3 rounded-xl bg-pado-2/5 border border-pado-2/20">
                        <span className="text-sm font-normal text-pado-2 uppercase tracking-widest block mb-1">
                          Admin Response
                        </span>
                        <p className="text-sm text-uju-primary leading-relaxed whitespace-pre-wrap">
                          {report.adminNote}
                        </p>
                      </div>
                    )}
                    {report.userReply && (
                      <div className="p-3 rounded-xl bg-blue-400/5 border border-blue-400/20">
                        <span className="text-sm font-normal text-blue-300 uppercase tracking-widest block mb-1">
                          Your Follow-up
                        </span>
                        <p className="text-sm text-uju-primary leading-relaxed whitespace-pre-wrap">
                          {report.userReply}
                        </p>
                      </div>
                    )}
                    {report.rewardStatus === "rewarded" &&
                      report.bonusPoints != null && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-pado-4/5 text-pado-4 border border-pado-4/20">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-normal uppercase tracking-wide">
                            Rewarded: +{report.bonusPoints} ecosystem points
                          </span>
                        </div>
                      )}
                    {REPLY_ALLOWED_STATUSES.includes(report.status) && (
                      <ReplyComposer report={report} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bug Report Modal */}
      <Suspense fallback={null}>
        {modalOpen && (
          <BugReportModal open={modalOpen} onOpenChange={setModalOpen} />
        )}
      </Suspense>
    </UjuCard>
  );
};

interface ReplyComposerProps {
  report: BugReport;
}

const ReplyComposer: FC<ReplyComposerProps> = ({ report }) => {
  const [text, setText] = useState(report.userReply ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mutation = useReplyToBugReport();

  const trimmed = text.trim();
  const canSend =
    trimmed.length > 0 &&
    trimmed.length <= REPLY_MAX_LENGTH &&
    !mutation.isPending;

  const handleSend = () => {
    setErrorMsg(null);
    mutation.mutate(
      { reportId: report.reportId, timestamp: report.timestamp, text: trimmed },
      {
        onError: (err) => {
          if (err instanceof BugReportReplyError && err.status === 409) {
            setErrorMsg(
              "This ticket is being processed. Refresh and try again.",
            );
          } else {
            setErrorMsg(
              err instanceof Error ? err.message : "Failed to send reply",
            );
          }
        },
      },
    );
  };

  return (
    <div className="pt-4 border-t border-uju-border/10 space-y-3">
      <span className="text-sm font-normal text-uju-secondary uppercase tracking-widest block">
        {report.userReply
          ? "Editing your previous reply"
          : "Still having this issue? Send a follow-up"}
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, REPLY_MAX_LENGTH))}
        rows={3}
        placeholder="Describe what's still happening..."
        className="w-full bg-uju-bg/80 border border-uju-border/30 rounded-xl px-4 py-3 text-sm text-uju-primary placeholder-uju-secondary/40 focus:outline-none focus:border-pado-2 focus:ring-1 focus:ring-pado-2/20 transition-all resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-normal text-uju-secondary tabular-nums">
          {trimmed.length} / {REPLY_MAX_LENGTH}
        </span>
        <UjuButton
          size="sm"
          variant="primary"
          onClick={handleSend}
          disabled={!canSend}
        >
          {mutation.isPending ? "Sending..." : "Send follow-up"}
        </UjuButton>
      </div>
      {errorMsg && <p className="text-sm font-normal text-red-400 mt-1">{errorMsg}</p>}
    </div>
  );
};
