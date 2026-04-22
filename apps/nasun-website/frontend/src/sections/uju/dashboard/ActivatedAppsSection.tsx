import { useState } from 'react';
import { UjuCard } from '../shared/UjuCard';
import { MAX_PINNED, type UseAppDirectoryResult } from '../apps/useAppDirectory';
import { CHAIN_LABEL, CHAIN_BADGE_CLASS } from '../apps/appRegistry';
import { AppDirectoryModal } from '../apps/AppDirectoryModal';

interface ActivatedAppsSectionProps extends Omit<UseAppDirectoryResult, 'pinnedIds'> {}

export function ActivatedAppsSection({ pinnedApps, isPinned, pin, unpin, atMax }: ActivatedAppsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <UjuCard>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-uju-secondary">Activated Apps</p>
          {pinnedApps.length > 0 && (
            <span className="text-sm text-uju-secondary">
              {pinnedApps.length} / {MAX_PINNED}
            </span>
          )}
        </div>

        {pinnedApps.length === 0 ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-uju-secondary">No apps pinned yet.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="text-sm text-pado-3 hover:underline"
            >
              Browse App Directory
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-2 mb-3">
              {pinnedApps.map((app) => (
                <li key={app.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${CHAIN_BADGE_CLASS[app.chain]}`}>
                      {CHAIN_LABEL[app.chain]}
                    </span>
                    <span className="text-sm font-medium text-uju-primary">{app.name}</span>
                  </div>
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${app.name}, opens in new tab`}
                    className="text-sm text-pado-3 hover:underline"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setModalOpen(true)}
              className="w-full py-2 text-sm text-uju-secondary border border-uju-border rounded-lg hover:text-uju-primary hover:border-uju-secondary/50 transition-colors"
            >
              Manage Apps
            </button>
          </>
        )}
      </UjuCard>

      <AppDirectoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        isPinned={isPinned}
        pin={pin}
        unpin={unpin}
        atMax={atMax}
      />
    </>
  );
}
