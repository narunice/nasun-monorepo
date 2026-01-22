/**
 * SeasonFormModal - Create/Edit season modal
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { Season, CreateSeasonRequest } from '../../types/leaderboard-v3';

interface SeasonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSeasonRequest) => Promise<void>;
  editingSeason: Season | null;
  isSubmitting: boolean;
}

export function SeasonFormModal({
  isOpen,
  onClose,
  onSubmit,
  editingSeason,
  isSubmitting,
}: SeasonFormModalProps) {
  const [formData, setFormData] = useState<CreateSeasonRequest>({
    seasonId: '',
    name: '',
    description: '',
    startDate: '',
    endDate: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes or editing season changes
  useEffect(() => {
    if (isOpen) {
      if (editingSeason) {
        setFormData({
          seasonId: editingSeason.seasonId,
          name: editingSeason.name,
          description: editingSeason.description || '',
          startDate: editingSeason.startDate,
          endDate: editingSeason.endDate,
        });
      } else {
        setFormData({
          seasonId: '',
          name: '',
          description: '',
          startDate: '',
          endDate: '',
        });
      }
      setError(null);
    }
  }, [isOpen, editingSeason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.seasonId.trim()) {
      setError('Season ID is required');
      return;
    }
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.startDate) {
      setError('Start date is required');
      return;
    }
    if (!formData.endDate) {
      setError('End date is required');
      return;
    }
    if (formData.startDate >= formData.endDate) {
      setError('Start date must be before end date');
      return;
    }

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save season');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-nasun-c5/30 rounded-sm w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-nasun-white">
            {editingSeason ? 'Edit Season' : 'Create New Season'}
          </h3>
          <button
            onClick={onClose}
            className="text-nasun-white/50 hover:text-nasun-white text-xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Season ID */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
              Season ID *
            </label>
            <input
              type="text"
              value={formData.seasonId}
              onChange={(e) => setFormData({ ...formData, seasonId: e.target.value.toUpperCase() })}
              placeholder="SEASON1"
              disabled={!!editingSeason}
              className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c3/50 transition-colors font-mono text-sm disabled:opacity-50"
            />
            {!editingSeason && (
              <p className="mt-1 text-xs text-nasun-white/40">
                Alphanumeric only. Cannot be changed after creation.
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Season 1"
              className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c3/50 transition-colors text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="New Year Event"
              className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c3/50 transition-colors text-sm"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white focus:outline-none focus:border-nasun-c3/50 transition-colors text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-nasun-white/50 font-medium mb-2">
                End Date *
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 text-nasun-white focus:outline-none focus:border-nasun-c3/50 transition-colors text-sm"
              />
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-900/30 rounded-sm">
            <p className="text-xs text-yellow-400">
              ⚠️ Season dates cannot overlap with existing seasons.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-900/50 rounded-sm">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outlineC5"
              size="lg"
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="c4"
              size="lg"
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Saving...'
                : editingSeason
                  ? 'Update Season'
                  : 'Create Season'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
