/**
 * SeasonManagementTab - Season CRUD for Leaderboard V3 Admin
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { OuterBox } from '@/components/ui/OuterBox';
import { Button } from '@/components/ui/button';
import { useAdminSeasons } from '../../hooks/useAdminSeasons';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { SeasonFormModal } from './SeasonFormModal';
import { previewSnapshot, triggerSnapshot } from '../../services/leaderboardV3Api';
import type { SnapshotPreviewEntry, SnapshotPreviewResponse } from '../../services/leaderboardV3Api';
import type { Season, CreateSeasonRequest } from '../../types/leaderboard-v3';

type SeasonStatus = 'active' | 'upcoming' | 'ended' | 'archived';

const STATUS_STYLES: Record<SeasonStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-900/30', text: 'text-green-400', label: '🟢 Active' },
  upcoming: { bg: 'bg-blue-900/30', text: 'text-blue-400', label: '🔵 Upcoming' },
  ended: { bg: 'bg-red-900/30', text: 'text-red-400', label: '🔴 Ended' },
  archived: { bg: 'bg-gray-900/30', text: 'text-gray-400', label: '⚫ Archived' },
};

function getRankChangeLabel(entry: SnapshotPreviewEntry): string {
  if (entry.previousRank === undefined) return 'NEW';
  const diff = entry.previousRank - entry.rank;
  if (diff > 0) return `+${diff}`;
  if (diff < 0) return `${diff}`;
  return '-';
}

function getRankChangeColor(entry: SnapshotPreviewEntry): string {
  if (entry.previousRank === undefined) return 'text-blue-400';
  const diff = entry.previousRank - entry.rank;
  if (diff > 0) return 'text-green-400';
  if (diff < 0) return 'text-red-400';
  return 'text-nasun-white/60';
}

export function SeasonManagementTab() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);

  // Snapshot state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isTriggeringSnapshot, setIsTriggeringSnapshot] = useState(false);
  const [previewResult, setPreviewResult] = useState<SnapshotPreviewResponse | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { cognitoToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const {
    seasons,
    isLoading,
    createSeason,
    updateSeason,
    deleteSeason,
    activateSeason,
    endSeason,
    isCreating,
    isUpdating,
    isDeleting,
    isActivating,
    isEnding,
  } = useAdminSeasons();

  const handleCreateClick = () => {
    setEditingSeason(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (season: Season) => {
    setEditingSeason(season);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (data: CreateSeasonRequest) => {
    if (editingSeason) {
      await updateSeason({ seasonId: editingSeason.seasonId, ...data });
    } else {
      await createSeason(data);
    }
    setIsModalOpen(false);
    setEditingSeason(null);
  };

  const handleDelete = async (seasonId: string) => {
    if (confirm(`Are you sure you want to delete season "${seasonId}"? This cannot be undone.`)) {
      await deleteSeason(seasonId);
    }
  };

  const handleActivate = async (seasonId: string) => {
    if (confirm(`Activate season "${seasonId}"? This will deactivate the current active season.`)) {
      await activateSeason(seasonId);
    }
  };

  const handleEnd = async (seasonId: string) => {
    if (confirm(`End season "${seasonId}"? This will generate a final snapshot.`)) {
      await endSeason(seasonId);
    }
  };

  const handlePreviewSnapshot = async () => {
    if (!cognitoToken) return;
    setIsPreviewing(true);
    setSnapshotMessage(null);
    try {
      const result = await previewSnapshot(cognitoToken);
      setPreviewResult(result);
    } catch (err) {
      setSnapshotMessage({ type: 'error', text: err instanceof Error ? err.message : 'Preview failed' });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleGenerateSnapshot = () => {
    if (!cognitoToken) return;
    setIsConfirmOpen(true);
  };

  const handleConfirmGenerate = async () => {
    if (!cognitoToken) return;
    setIsConfirmOpen(false);
    setPreviewResult(null);
    setIsTriggeringSnapshot(true);
    setSnapshotMessage(null);
    try {
      const result = await triggerSnapshot(cognitoToken);
      // Invalidate featured feed cache so leaderboard reflects the new snapshot
      queryClient.invalidateQueries({ queryKey: ['leaderboard-v3', 'featured-feed'] });
      setSnapshotMessage({
        type: 'success',
        text: `Snapshot saved for ${result.snapshotDate} — ${result.snapshotCount} accounts`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Snapshot generation failed';
      setSnapshotMessage({ type: 'error', text: msg });
    } finally {
      setIsTriggeringSnapshot(false);
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return {
      range: `${start.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })} - ${end.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}`,
      days: `(${days} days)`,
    };
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-nasun-white">Season Management</h3>
        <Button onClick={handleCreateClick} variant="c4" size="sm">
          + New Season
        </Button>
      </div>

      {/* Snapshot actions for active season */}
      {seasons?.some((s) => s.status === 'active') && (
        <OuterBox color="c6" className="w-full !border-nasun-c5/45 !bg-gray-800/50">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-nasun-white">Snapshot</div>
                <div className="text-xs text-nasun-white/70 mt-0.5">
                  Preview or generate today's leaderboard snapshot
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePreviewSnapshot}
                  variant="outlineC5"
                  size="sm"
                  disabled={isPreviewing || isTriggeringSnapshot}
                >
                  {isPreviewing ? 'Previewing...' : 'Preview Snapshot'}
                </Button>
                <Button
                  onClick={handleGenerateSnapshot}
                  variant="c4"
                  size="sm"
                  disabled={isPreviewing || isTriggeringSnapshot}
                >
                  {isTriggeringSnapshot ? 'Generating...' : 'Generate Snapshot'}
                </Button>
              </div>
            </div>

            {snapshotMessage && (
              <div
                className={`text-sm px-3 py-2 rounded ${
                  snapshotMessage.type === 'success'
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                {snapshotMessage.text}
              </div>
            )}
          </div>
        </OuterBox>
      )}

      {/* Seasons Table */}
      <OuterBox color="c6" className="w-full !border-nasun-c5/45 !bg-gray-800/50">
        {isLoading ? (
          <div className="text-nasun-white/70 text-sm py-8 text-center">Loading seasons...</div>
        ) : !seasons?.length ? (
          <div className="text-nasun-white/70 text-sm py-8 text-center">
            No seasons created yet. Click "New Season" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nasun-c5/35">
                  <th className="text-left py-3 px-2 text-nasun-white/70 font-medium">Season ID</th>
                  <th className="text-left py-3 px-2 text-nasun-white/70 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-nasun-white/70 font-medium">Period</th>
                  <th className="text-left py-3 px-2 text-nasun-white/70 font-medium">Status</th>
                  <th className="text-right py-3 px-2 text-nasun-white/70 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((season) => {
                  const { range, days } = formatDateRange(season.startDate, season.endDate);
                  const statusStyle = STATUS_STYLES[season.status as SeasonStatus] || STATUS_STYLES.upcoming;

                  return (
                    <tr
                      key={season.seasonId}
                      className="border-b border-nasun-c5/20 hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <div className="font-mono text-nasun-white">{season.seasonId}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-nasun-white">{season.name}</div>
                        {season.description && (
                          <div className="text-xs text-nasun-white/70">"{season.description}"</div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-nasun-white/90">{range}</div>
                        <div className="text-xs text-nasun-white/70">{days}</div>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {statusStyle.label}
                        </span>
                        {season.isDefault && (
                          <span className="ml-2 text-xs text-nasun-c3">Default</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => handleEditClick(season)}
                            variant="outlineC5"
                            size="sm"
                          >
                            Edit
                          </Button>

                          {season.status === 'upcoming' && (
                            <Button
                              onClick={() => handleActivate(season.seasonId)}
                              variant="c4"
                              size="sm"
                              disabled={isActivating}
                            >
                              Activate
                            </Button>
                          )}

                          {season.status === 'active' && (
                            <Button
                              onClick={() => handleEnd(season.seasonId)}
                              variant="outlineC5"
                              size="sm"
                              disabled={isEnding}
                            >
                              End
                            </Button>
                          )}

                          {(season.status === 'upcoming' || season.status === 'ended') && (
                            <Button
                              onClick={() => handleDelete(season.seasonId)}
                              variant="outlineC5"
                              size="sm"
                              disabled={isDeleting}
                              className="text-red-400 hover:text-red-300"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </OuterBox>

      {/* Generate Snapshot Confirmation Modal */}
      {isConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setIsConfirmOpen(false)}
        >
          <div
            className="bg-gray-900 border border-nasun-c5/45 rounded-lg w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-nasun-c5/35">
              <div className="text-sm font-medium text-nasun-white">Generate Snapshot</div>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-sm text-nasun-white/90">
                This will save today's leaderboard snapshot and update the public rankings.
              </p>
              <div className="px-3 py-2 rounded bg-yellow-900/30 border border-yellow-600/30 text-yellow-400 text-xs">
                If a snapshot already exists for today, this will return an error (no overwrite).
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-nasun-c5/35">
              <Button variant="outlineC5" size="sm" onClick={() => setIsConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="c4" size="sm" onClick={handleConfirmGenerate}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Season Form Modal */}
      <SeasonFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSeason(null);
        }}
        onSubmit={handleModalSubmit}
        editingSeason={editingSeason}
        isSubmitting={isCreating || isUpdating}
      />

      {/* Snapshot Preview Modal */}
      {previewResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPreviewResult(null)}
        >
          <div
            className="bg-gray-900 border border-nasun-c5/45 rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-nasun-c5/35">
              <div>
                <div className="text-sm font-medium text-nasun-white">Snapshot Preview</div>
                <div className="text-xs text-nasun-white/70 mt-0.5">
                  Season: {previewResult.seasonId} — {previewResult.totalAccounts} accounts — {new Date(previewResult.calculatedAt).toLocaleString('en-US', { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
              <button
                onClick={() => setPreviewResult(null)}
                className="text-nasun-white/70 hover:text-nasun-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Simulation warning */}
            <div className="mx-4 mt-3 px-3 py-2 rounded bg-yellow-900/30 border border-yellow-600/30 text-yellow-400 text-xs font-medium">
              SIMULATION — This data is NOT saved. Click "Generate Snapshot" to apply.
            </div>

            {/* Preview table */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="border-b border-nasun-c5/35">
                    <th className="text-left py-2 pr-3 text-nasun-white/70 font-medium w-10">Rank</th>
                    <th className="text-left py-2 pr-3 text-nasun-white/70 font-medium">User</th>
                    <th className="text-right py-2 pr-3 text-nasun-white/70 font-medium">Score</th>
                    <th className="text-right py-2 pr-3 text-nasun-white/70 font-medium">Raw</th>
                    <th className="text-right py-2 pr-3 text-nasun-white/70 font-medium">Posts</th>
                    <th className="text-right py-2 text-nasun-white/70 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.preview.map((entry: SnapshotPreviewEntry) => (
                    <tr key={entry.rank} className="border-b border-nasun-c5/20 hover:bg-gray-800/30">
                      <td className="py-1.5 pr-3 text-nasun-white/80 font-mono">{entry.rank}</td>
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          {entry.profileImageUrl ? (
                            <img
                              src={entry.profileImageUrl}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-700 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-nasun-white font-medium truncate">
                              {entry.displayName || entry.username}
                            </div>
                            {entry.displayName && entry.displayName !== entry.username && (
                              <div className="text-nasun-white/60 text-[10px] truncate">@{entry.username}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-nasun-c7 font-mono">
                        {entry.userScore.toFixed(3)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-nasun-white/80 font-mono">
                        {entry.rawScore.toFixed(3)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-nasun-white/80">{entry.postCount}</td>
                      <td className={`py-1.5 text-right font-mono font-medium ${getRankChangeColor(entry)}`}>
                        {getRankChangeLabel(entry)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-nasun-c5/35">
              <Button variant="outlineC5" size="sm" onClick={() => setPreviewResult(null)}>
                Close
              </Button>
              <Button
                variant="c4"
                size="sm"
                onClick={handleGenerateSnapshot}
                disabled={isTriggeringSnapshot}
              >
                Generate Snapshot
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
