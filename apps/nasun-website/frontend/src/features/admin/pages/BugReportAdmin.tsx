/**
 * BugReportAdmin - Admin page for managing bug reports
 *
 * Lists all bug reports, allows status changes, admin notes,
 * and bonus points rewards.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/features/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BugReport, BugReportStatus } from "@/features/bug-report/types";
import { STATUS_LABELS, STATUS_COLORS } from "@/features/bug-report/types";
import { toast } from "react-toastify";

const BUG_REPORT_API_URL = import.meta.env.VITE_BUG_REPORT_API_URL;

const VALID_STATUSES: BugReportStatus[] = ['new', 'investigating', 'in-progress', 'fixed', 'wont-fix', 'duplicate'];

// ============================================
// API functions
// ============================================

async function fetchBugReports(token: string, status?: string): Promise<BugReport[]> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${BUG_REPORT_API_URL}/admin/bug-reports${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.reports || [];
}

async function updateBugReport(
  token: string,
  reportId: string,
  timestamp: string,
  updates: { status?: string; adminNote?: string; bonusPoints?: number },
): Promise<{ success: boolean; reward?: { success: boolean; finalPoints?: number; error?: string } }> {
  const res = await fetch(`${BUG_REPORT_API_URL}/admin/bug-reports/${reportId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...updates, timestamp }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================
// Component
// ============================================

export function BugReportAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('new');
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [newStatus, setNewStatus] = useState<BugReportStatus>('new');
  const [bonusPoints, setBonusPoints] = useState<number>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const adminNoteRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the Admin Note textarea so long feedback stays fully visible
  useEffect(() => {
    const el = adminNoteRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [adminNote, selectedReport]);

  const token = user?.cognitoToken;

  const { data: reports, isLoading } = useQuery({
    queryKey: ['admin-bug-reports', statusFilter],
    queryFn: () => fetchBugReports(token!, statusFilter),
    enabled: !!token,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: (params: { reportId: string; timestamp: string; updates: { status?: string; adminNote?: string; bonusPoints?: number } }) =>
      updateBugReport(token!, params.reportId, params.timestamp, params.updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports'] });
      if (data.reward?.success) {
        toast.success(`Updated. Reward: ${data.reward.finalPoints} pts`);
      } else if (data.reward?.error) {
        toast.warn(`Updated, but reward failed: ${data.reward.error}`);
      } else {
        toast.success('Bug report updated');
      }
      setSelectedReport(null);
      setShowConfirm(false);
    },
    onError: (err: Error) => {
      toast.error(`Update failed: ${err.message}`);
      setShowConfirm(false);
    },
  });

  const selectReport = useCallback((report: BugReport) => {
    setSelectedReport(report);
    setAdminNote(report.adminNote || '');
    setNewStatus(report.status);
    setBonusPoints(report.bonusPoints || 0);
  }, []);

  const handleSubmit = () => {
    if (!selectedReport) return;
    setShowConfirm(false);
    updateMutation.mutate({
      reportId: selectedReport.reportId,
      timestamp: selectedReport.timestamp,
      updates: {
        status: newStatus !== selectedReport.status ? newStatus : undefined,
        adminNote: adminNote !== (selectedReport.adminNote || '') ? adminNote : undefined,
        bonusPoints: newStatus === 'fixed' && bonusPoints > 0 ? bonusPoints : undefined,
      },
    });
  };

  if (!BUG_REPORT_API_URL) {
    return (
      <AdminLayout>
        <SectionLayout className="!max-w-6xl !pt-0">
          <p className="text-white/50">Bug Report API not configured</p>
        </SectionLayout>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <PageTitle as="h3" align="left">Bug Reports</PageTitle>

        {/* Status Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {VALID_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                statusFilter === s
                  ? 'border-nasun-c4 bg-nasun-c4/20 text-nasun-c4'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Report List */}
          <div className="lg:w-1/2 space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : !reports || reports.length === 0 ? (
              <p className="text-white/40 text-sm py-4">No reports with status "{STATUS_LABELS[statusFilter as BugReportStatus]}"</p>
            ) : (
              reports.map((report) => (
                <button
                  key={report.reportId}
                  onClick={() => selectReport(report)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedReport?.reportId === report.reportId
                      ? 'border-nasun-c4/50 bg-nasun-c4/5'
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {report.profileImageUrl && (
                      <img src={report.profileImageUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                    )}
                    <span className="text-sm text-nasun-white font-medium truncate flex-1">{report.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[report.status]}`}>
                      {STATUS_LABELS[report.status]}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-white/50 flex-wrap">
                    {report.twitterHandle && (
                      <span className="text-nasun-c4">@{report.twitterHandle}</span>
                    )}
                    <span>{report.category}</span>
                    <span>{new Date(report.timestamp).toLocaleDateString('en-US')}</span>
                    {report.screenshotKeys && report.screenshotKeys.length > 0 && (
                      <span>{report.screenshotKeys.length} img</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Report Detail / Edit Panel */}
          <div className="lg:w-1/2">
            {selectedReport ? (
              <OuterBox>
                <div className="p-5 space-y-4">
                  {/* Title + Reporter profile */}
                  <div className="flex items-center gap-3">
                    {selectedReport.profileImageUrl && (
                      <img
                        src={selectedReport.profileImageUrl}
                        alt=""
                        className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-nasun-white">{selectedReport.title}</h3>
                      {selectedReport.twitterHandle && (
                        <a
                          href={`https://x.com/${selectedReport.twitterHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-nasun-c4 hover:underline"
                        >
                          @{selectedReport.twitterHandle}
                        </a>
                      )}
                      {!selectedReport.twitterHandle && selectedReport.displayName && (
                        <span className="text-sm text-white/60">{selectedReport.displayName}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 text-sm">
                    {/* Description */}
                    <div>
                      <span className="text-white/50 text-xs block mb-0.5">Description</span>
                      <p className="text-white/80 whitespace-pre-wrap">{selectedReport.description}</p>
                    </div>
                    {selectedReport.reproSteps && (
                      <div>
                        <span className="text-white/50 text-xs block mb-0.5">Steps to Reproduce</span>
                        <p className="text-white/80 whitespace-pre-wrap">{selectedReport.reproSteps}</p>
                      </div>
                    )}
                    {selectedReport.userReply && (
                      <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
                        <span className="text-amber-300 text-xs font-medium block mb-0.5">User Reply (follow-up)</span>
                        <p className="text-amber-100/90 whitespace-pre-wrap">{selectedReport.userReply}</p>
                      </div>
                    )}

                    {/* User Info (copyable) */}
                    <div className="bg-white/[0.03] rounded-lg p-3 space-y-1.5">
                      <span className="text-white/50 text-xs block">Reporter Info</span>
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <span className="text-white/50">Report ID</span>
                        <span className="text-white/70 font-mono break-all select-all">{selectedReport.reportId}</span>
                        <span className="text-white/50">Identity ID</span>
                        <span className="text-white/70 font-mono break-all select-all">{selectedReport.identityId}</span>
                        <span className="text-white/50">Wallet</span>
                        <span className="text-white/70 font-mono break-all select-all">{selectedReport.walletAddress || 'N/A'}</span>
                        <span className="text-white/50">Category</span>
                        <span className="text-white/70">{selectedReport.category}</span>
                        <span className="text-white/50">Submitted</span>
                        <span className="text-white/70">{new Date(selectedReport.timestamp).toLocaleString('en-US')}</span>
                        {selectedReport.pageUrl && (
                          <>
                            <span className="text-white/50">Page</span>
                            <span className="text-white/70 break-all">{selectedReport.pageUrl}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Screenshots */}
                  {selectedReport.screenshotUrls && selectedReport.screenshotUrls.length > 0 && (
                    <div>
                      <span className="text-white/40 text-xs block mb-1">Screenshots</span>
                      <div className="flex gap-2 flex-wrap">
                        {selectedReport.screenshotUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt={`Screenshot ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border border-white/10 hover:border-nasun-c4/50 transition-colors" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <hr className="border-white/5" />

                  {/* Status */}
                  <div>
                    <label className="text-xs text-white/50 block mb-1">Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as BugReportStatus)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nasun-c4/50"
                    >
                      {VALID_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-nasun-black">{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Admin Note */}
                  <div>
                    <label className="text-xs text-white/50 block mb-1">Admin Note</label>
                    <textarea
                      ref={adminNoteRef}
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value.slice(0, 1000))}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50 resize-y overflow-hidden min-h-[4.5rem]"
                      placeholder="Response visible to the reporter"
                    />
                  </div>

                  {/* Bonus Points (only when fixing and not already rewarded) */}
                  {newStatus === 'fixed' && selectedReport.rewardStatus !== 'rewarded' && (
                    <div>
                      <label className="text-xs text-white/50 block mb-1">
                        Bonus Points (0-100)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={bonusPoints}
                          onChange={(e) => setBonusPoints(parseInt(e.target.value))}
                          className="flex-1 accent-nasun-c4"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={bonusPoints}
                          onChange={(e) => setBonusPoints(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-nasun-c4/50"
                        />
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {[1, 3, 5, 10, 20, 50].map((v) => (
                          <button
                            key={v}
                            onClick={() => setBonusPoints(v)}
                            className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                              bonusPoints === v
                                ? 'border-nasun-c4 bg-nasun-c4/20 text-nasun-c4'
                                : 'border-white/10 text-white/40 hover:border-white/20'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submit */}
                  {(() => {
                    const alreadyRewarded = selectedReport.rewardStatus === 'rewarded';
                    const statusUnchanged = newStatus === selectedReport.status;
                    const adminNoteUnchanged = adminNote === (selectedReport.adminNote || '');
                    const noopReReward = alreadyRewarded && newStatus === 'fixed' && statusUnchanged && adminNoteUnchanged;
                    const disabled = updateMutation.isPending || noopReReward;
                    const label = updateMutation.isPending
                      ? 'Updating...'
                      : noopReReward
                        ? 'Already Rewarded'
                        : newStatus === 'fixed' && bonusPoints > 0 && !alreadyRewarded
                          ? 'Resolve & Reward'
                          : 'Update Report';
                    return (
                      <Button
                        onClick={() => setShowConfirm(true)}
                        disabled={disabled}
                        className="w-full bg-nasun-c4 hover:bg-nasun-c4/80 text-nasun-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {label}
                      </Button>
                    );
                  })()}

                  {/* Reward status */}
                  {selectedReport.rewardStatus && (
                    <div className={`text-xs ${selectedReport.rewardStatus === 'rewarded' ? 'text-green-400' : 'text-yellow-400'}`}>
                      Reward status: {selectedReport.rewardStatus}
                      {selectedReport.bonusPoints != null && ` (${selectedReport.bonusPoints} pts)`}
                    </div>
                  )}
                </div>
              </OuterBox>
            ) : (
              <OuterBox>
                <div className="p-8 text-center text-white/30 text-sm">
                  Select a report to view details
                </div>
              </OuterBox>
            )}
          </div>
        </div>

        {/* Confirmation Dialog */}
        {showConfirm && selectedReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-gray-900 border border-nasun-c5/45 rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
              <h4 className="text-lg font-semibold text-nasun-white">Confirm Update</h4>
              <div className="space-y-2 text-sm text-nasun-white/85">
                <p>Report: <span className="text-nasun-white">{selectedReport.title}</span></p>
                {newStatus !== selectedReport.status && (
                  <p>Status: <span className="text-nasun-white">{STATUS_LABELS[selectedReport.status]} -&gt; {STATUS_LABELS[newStatus]}</span></p>
                )}
                {newStatus === 'fixed' && bonusPoints > 0 && (
                  <p>Bonus: <span className="text-green-400">+{bonusPoints} pts</span></p>
                )}
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowConfirm(false)} className="border-nasun-c5/45 text-nasun-white/85">
                  Cancel
                </Button>
                <Button onClick={handleSubmit} className="bg-nasun-c4 hover:bg-nasun-c4/80 text-nasun-white">
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
