/**
 * BugReportsCard Component
 *
 * Shows user's submitted bug reports and their status in My Account.
 */

import { FC, useState } from "react";
import { OuterBox, Spinner } from "@/components/ui";
import { useMyBugReports } from "@/features/bug-report/hooks/useBugReport";
import type { BugReport } from "@/features/bug-report/types";
import { STATUS_LABELS, STATUS_COLORS } from "@/features/bug-report/types";

interface BugReportsCardProps {
  className?: string;
}

export const BugReportsCard: FC<BugReportsCardProps> = ({ className = "" }) => {
  const { data: reports, isLoading, error } = useMyBugReports();
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);

  if (!import.meta.env.VITE_BUG_REPORT_API_URL) return null;

  return (
    <OuterBox className={className}>
      <div className="p-5">
        <h3 className="text-base font-semibold text-nasun-white mb-3">
          My Bug Reports
        </h3>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">Failed to load reports</p>
        ) : !reports || reports.length === 0 ? (
          <p className="text-sm text-white/40">No bug reports yet</p>
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
      </div>
    </OuterBox>
  );
};
