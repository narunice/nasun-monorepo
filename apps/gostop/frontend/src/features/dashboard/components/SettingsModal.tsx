import { useEffect, useState } from 'react';
import { useMeSettings, useUpdateMeSettings } from '../../../lib/api/queries';
import type { FeedVisibility } from '../../../lib/api/types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const OPTIONS: { value: FeedVisibility; label: string; description: string }[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Your wallet appears on the live feed in full.',
  },
  {
    value: 'anonymous',
    label: 'Anonymous',
    description: 'Your wallet shows as a salted pseudonym. Stats are bucketed under that pseudonym.',
  },
  {
    value: 'delayed',
    label: 'Delayed (24h)',
    description:
      'Your rounds appear on the public feed only after a 24-hour delay, and are excluded from public leaderboards entirely. Your own profile and standing still update immediately.',
  },
  {
    value: 'opt-out',
    label: 'Opt out',
    description:
      'Your rounds never appear on the public feed or leaderboards. Your own profile and standing still update immediately.',
  },
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { data, isLoading, isError, error } = useMeSettings();
  const mutate = useUpdateMeSettings();
  const [selected, setSelected] = useState<FeedVisibility | null>(null);

  useEffect(() => {
    if (open && data) setSelected(data.feed_visibility);
  }, [open, data]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dirty = selected !== null && data !== undefined && selected !== data.feed_visibility;
  const saving = mutate.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel max-w-md w-full p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="settings-modal-title" className="font-display text-2xl text-gold">
            Feed Visibility
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-300 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        {isLoading && <p className="text-sm text-neutral-200">Loading settings…</p>}
        {isError && (
          <p className="text-sm text-rose-300">Failed to load settings: {error.message}</p>
        )}

        {data && selected !== null && (
          <>
            <div className="space-y-2">
              {OPTIONS.map((opt) => {
                const active = selected === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`block rounded-lg border p-3 cursor-pointer transition-colors ${
                      active
                        ? 'border-gold-300/60 bg-gold-400/10'
                        : 'border-gold-subtle hover:bg-gold-400/5'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="feed-visibility"
                        value={opt.value}
                        checked={active}
                        onChange={() => setSelected(opt.value)}
                        className="mt-1 accent-amber-400"
                      />
                      <div>
                        <span className="block text-sm font-medium text-neutral-100">
                          {opt.label}
                        </span>
                        <span className="block text-sm text-neutral-300 mt-0.5">
                          {opt.description}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {mutate.isError && (
              <p className="text-sm text-rose-300">
                Save failed: {(mutate.error as Error).message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gold-subtle">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-200 hover:text-neutral-100 min-h-[40px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!dirty || !selected) return;
                  mutate.mutate(
                    { feed_visibility: selected },
                    {
                      onSuccess: () => onClose(),
                    },
                  );
                }}
                disabled={!dirty || saving}
                className="px-4 py-2 text-sm font-medium rounded-md bg-gold-400/20 text-gold-100 border border-gold-300/50 hover:bg-gold-400/30 disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
