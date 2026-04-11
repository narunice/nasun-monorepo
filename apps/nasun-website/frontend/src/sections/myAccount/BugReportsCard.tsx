/**
 * BugReportsCard Component
 *
 * Bug report section in My Account page.
 * Shows "Report a Bug" button + list of user's submitted reports with status tracking.
 */

import { FC, useState, lazy, Suspense } from "react";
import { OuterBox, Spinner } from "@/components/ui";
import { useMyBugReports } from "@/features/bug-report/hooks/useBugReport";
import type { BugReport } from "@/features/bug-report/types";
import { STATUS_LABELS, STATUS_COLORS } from "@/features/bug-report/types";

const BugReportModal = lazy(() => import("@/features/bug-report/components/BugReportModal"));

interface BugReportsCardProps {
  className?: string;
}

export const BugReportsCard: FC<BugReportsCardProps> = ({ className = "" }) => {
  const { data: reports, isLoading, error } = useMyBugReports();
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (!import.meta.env.VITE_BUG_REPORT_API_URL) return null;

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      <div className="flex items-center justify-between mb-3">
        <h5 className="font-medium uppercase text-nasun-white">
          Bug Reports
        </h5>
          <button
            onClick={() => setModalOpen(true)}
            className="px-3 py-1.5 text-xs font-medium bg-nasun-c4/20 text-nasun-c4 border border-nasun-c4/30 rounded-lg hover:bg-nasun-c4/30 transition-colors"
          >
            Report a Bug
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">Failed to load reports</p>
        ) : !reports || reports.length === 0 ? (
          <p className="text-sm text-white/40">No bug reports yet. Found an issue? Report it and earn rewards!</p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <button
                key={report.reportId}
                onClick={() => setSelectedReport(
                  selectedReport?.reportId === report.reportId ? null : report
                )}
                className="w-full text-left p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-nasun-white truncate flex-1">
                    {report.title}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[report.status]}`}>
                    {STATUS_LABELS[report.status]}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-white/30">
                    {new Date(report.timestamp).toLocaleDateString('en-US')}
                  </span>
                  <span className="text-[10px] text-white/20">{report.category}</span>
                  {report.bonusPoints != null && report.bonusPoints > 0 && (
                    <span className="text-[10px] text-green-400">
                      +{report.bonusPoints} pts
                    </span>
                  )}
                </div>

                {/* Expanded detail */}
                {selectedReport?.reportId === report.reportId && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                    <div>
                      <span className="text-[10px] text-white/40 block">Description</span>
                      <p className="text-xs text-white/70 whitespace-pre-wrap">
                        {report.description}
                      </p>
                    </div>
                    {report.adminNote && (
                      <div>
                        <span className="text-[10px] text-white/40 block">Admin Response</span>
                        <p className="text-xs text-nasun-c4/80">{report.adminNote}</p>
                      </div>
                    )}
                    {report.rewardStatus === 'rewarded' && report.bonusPoints != null && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-green-400">
                          Rewarded: +{report.bonusPoints} ecosystem points
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
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
