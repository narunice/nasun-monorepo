/**
 * SeasonManagementTab - Season CRUD for Leaderboard V3 Admin
 */

import { useState } from 'react';
import { OuterBox } from '@/components/ui/OuterBox';
import { Button } from '@/components/ui/button';
import { useAdminSeasons } from '../../hooks/useAdminSeasons';
import { SeasonFormModal } from './SeasonFormModal';
import type { Season, CreateSeasonRequest } from '../../types/leaderboard-v3';

type SeasonStatus = 'active' | 'upcoming' | 'ended' | 'archived';

const STATUS_STYLES: Record<SeasonStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-900/30', text: 'text-green-400', label: '🟢 Active' },
  upcoming: { bg: 'bg-blue-900/30', text: 'text-blue-400', label: '🔵 Upcoming' },
  ended: { bg: 'bg-red-900/30', text: 'text-red-400', label: '🔴 Ended' },
  archived: { bg: 'bg-gray-900/30', text: 'text-gray-400', label: '⚫ Archived' },
};

export function SeasonManagementTab() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);

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

      {/* Seasons Table */}
      <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30">
        {isLoading ? (
          <div className="text-nasun-white/50 text-sm py-8 text-center">Loading seasons...</div>
        ) : !seasons?.length ? (
          <div className="text-nasun-white/50 text-sm py-8 text-center">
            No seasons created yet. Click "New Season" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nasun-c5/20">
                  <th className="text-left py-3 px-2 text-nasun-white/50 font-medium">Season ID</th>
                  <th className="text-left py-3 px-2 text-nasun-white/50 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-nasun-white/50 font-medium">Period</th>
                  <th className="text-left py-3 px-2 text-nasun-white/50 font-medium">Status</th>
                  <th className="text-right py-3 px-2 text-nasun-white/50 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((season) => {
                  const { range, days } = formatDateRange(season.startDate, season.endDate);
                  const statusStyle = STATUS_STYLES[season.status as SeasonStatus] || STATUS_STYLES.upcoming;

                  return (
                    <tr
                      key={season.seasonId}
                      className="border-b border-nasun-c5/10 hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <div className="font-mono text-nasun-white">{season.seasonId}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-nasun-white">{season.name}</div>
                        {season.description && (
                          <div className="text-xs text-nasun-white/50">"{season.description}"</div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-nasun-white/80">{range}</div>
                        <div className="text-xs text-nasun-white/50">{days}</div>
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
    </div>
  );
}
