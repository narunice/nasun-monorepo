/**
 * BugReportsCard Component
 *
 * Bug report section in My Account page.
 * Shows "Report a Bug" button + list of user's submitted reports with status tracking.
 */

import { FC, useState, lazy, Suspense } from "react";
import { OuterBox, Spinner } from "@/components/ui";
import {
  useMyBugReports,
  useReplyToBugReport,
  BugReportReplyError,
} from "@/features/bug-report/hooks/useBugReport";
import type { BugReport } from "@/features/bug-report/types";
import { STATUS_LABELS, STATUS_COLORS } from "@/features/bug-report/types";

const REPLY_MAX_LENGTH = 1000;
const REPLY_ALLOWED_STATUSES: Array<BugReport["status"]> = [
  "fixed",
  "wont-fix",
];

const BugReportModal = lazy(
  () => import("@/features/bug-report/components/BugReportModal"),
);

interface BugReportsCardProps {
  className?: string;
}

export const BugReportsCard: FC<BugReportsCardProps> = ({ className = "" }) => {
  const { data: reports, isLoading, error } = useMyBugReports();
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (!import.meta.env.VITE_BUG_REPORT_API_URL) return null;

  return (
    <OuterBox color="w2" padding="sm" className={className}>
      <h5 className="font-medium uppercase text-nasun-white mb-3">
        Bug Reports
      </h5>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">Failed to load reports</p>
      ) : !reports || reports.length === 0 ? (
        <div className="flex flex-col items-center py-4 gap-3">
          <p className="text-base text-white/70 text-center">
            No bug reports yet. Found an issue? Report it and earn points!
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 text-sm font-medium bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30 rounded-lg hover:bg-nasun-c4/30 transition-colors"
          >
            Report a Bug
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {reports.map((report) => {
              const isExpanded = selectedReport?.reportId === report.reportId;
              return (
                <div
                  key={report.reportId}
                  className="rounded-lg bg-white/[0.03] border border-white/5 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedReport(isExpanded ? null : report)
                    }
                    className="w-full text-left p-3 hover:bg-white/[0.03] rounded-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-nasun-white truncate flex-1">
                        {report.title}
                      </span>
                      <span
                        className={`text-sm px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[report.status]}`}
                      >
                        {STATUS_LABELS[report.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-white/80">
                        {new Date(report.timestamp).toLocaleDateString("en-US")}
                      </span>
                      <span className="text-sm text-white/80">
                        {report.category}
                      </span>
                      {report.bonusPoints != null && report.bonusPoints > 0 && (
                        <span className="text-sm text-green-400">
                          +{report.bonusPoints} pts
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-white/5 space-y-2">
                      <div className="pt-3">
                        <span className="text-sm text-white/80 block">
                          Description
                        </span>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">
                          {report.description}
                        </p>
                      </div>
                      {report.adminNote && (
                        <div>
                          <span className="text-sm text-white/80 block">
                            Admin Response
                          </span>
                          <p className="text-sm text-nasun-c4/80 whitespace-pre-wrap">
                            {report.adminNote}
                          </p>
                        </div>
                      )}
                      {report.userReply && (
                        <div>
                          <span className="text-sm text-white/80 block">
                            Your Follow-up
                          </span>
                          <p className="text-sm text-amber-200/90 whitespace-pre-wrap">
                            {report.userReply}
                          </p>
                        </div>
                      )}
                      {report.rewardStatus === "rewarded" &&
                        report.bonusPoints != null && (
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-green-400">
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
          <div className="flex justify-center mt-3">
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 text-sm font-medium bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30 rounded-lg hover:bg-nasun-c4/30 transition-colors"
            >
              Report a Bug
            </button>
          </div>
        </>
      )}

      {/* Bug Report Modal */}
      <Suspense fallback={null}>
        {modalOpen && (
          <BugReportModal open={modalOpen} onOpenChange={setModalOpen} />
        )}
      </Suspense>
    </OuterBox>
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
    <div className="pt-2 space-y-2">
      <span className="text-sm text-white/80 block">
        {report.userReply
          ? "Editing your previous reply"
          : "Still having this issue? Send a follow-up"}
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, REPLY_MAX_LENGTH))}
        rows={3}
        placeholder="Describe what's still happening..."
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50 resize-y"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white/80">
          {trimmed.length}/{REPLY_MAX_LENGTH}
        </span>
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="px-3 py-1.5 text-sm font-medium bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30 rounded-lg hover:bg-nasun-c4/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? "Sending..." : "Send follow-up"}
        </button>
      </div>
      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
    </div>
  );
};
