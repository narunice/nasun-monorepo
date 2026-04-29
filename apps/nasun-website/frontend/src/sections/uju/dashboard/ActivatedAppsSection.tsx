import { useState } from "react";
import { UjuCard, UjuButton, UjuSectionHeader } from "../shared";
import { MAX_PINNED, type UseAppDirectoryResult } from "../apps/useAppDirectory";
import { CHAIN_LABEL, CHAIN_BADGE_CLASS } from "../apps/appRegistry";
import { AppDirectoryModal } from "../apps/AppDirectoryModal";

interface ActivatedAppsSectionProps extends Omit<UseAppDirectoryResult, "pinnedIds"> {}

export function ActivatedAppsSection({ pinnedApps, isPinned, pin, unpin, atMax }: ActivatedAppsSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <UjuCard>
        <UjuSectionHeader
          accent
          title="Activated Apps, Services, and AI"
          trailing={
            pinnedApps.length > 0 ? (
              <span className="text-base font-medium text-pado-5 tabular-nums">
                {pinnedApps.length} / {MAX_PINNED}
              </span>
            ) : null
          }
        />

        {pinnedApps.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-base text-uju-secondary">No apps pinned yet.</p>
            <UjuButton variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
              Browse App Directory
            </UjuButton>
          </div>
        ) : (
          <>
            <ul className="space-y-2 mb-4">
              {pinnedApps.map((app) => (
                <li key={app.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-uju-bg/40 border border-uju-border/60 hover:border-pado-1/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-base font-medium px-2 py-0.5 rounded-full ${CHAIN_BADGE_CLASS[app.chain]}`}>
                      {CHAIN_LABEL[app.chain]}
                    </span>
                    <span className="text-base font-medium text-uju-primary truncate">{app.name}</span>
                  </div>
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${app.name}, opens in new tab`}
                    className="text-base font-medium text-pado-2 hover:text-pado-5 transition-colors shrink-0"
                  >
                    Open ↗
                  </a>
                </li>
              ))}
            </ul>
            <UjuButton variant="ghost" size="sm" fullWidth onClick={() => setModalOpen(true)}>
              Manage Apps
            </UjuButton>
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
