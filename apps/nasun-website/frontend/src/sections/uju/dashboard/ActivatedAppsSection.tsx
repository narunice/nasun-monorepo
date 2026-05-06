import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UjuCard, UjuButton, UjuSectionHeader } from "../shared";
import { goToActivityDirectory, useConsumeScrollTarget } from "../shared/ujuNavigation";
import type { UseAppDirectoryResult } from "../apps/useAppDirectory";
import { CHAIN_LABEL, CHAIN_BADGE_CLASS, type AppEntry } from "../apps/appRegistry";
import { UjuAppDetailsModal } from "../apps/UjuAppDetailsModal";

interface ActivatedAppsSectionProps {
  directory: UseAppDirectoryResult;
}

export function ActivatedAppsSection({ directory }: ActivatedAppsSectionProps) {
  const [, setSearchParams] = useSearchParams();
  const { pinnedApps } = directory;
  const [missionsApp, setMissionsApp] = useState<AppEntry | null>(null);
  const [flashMissions, setFlashMissions] = useState(false);

  const goToActivity = () => goToActivityDirectory(setSearchParams);

  // "Go to Activated Apps →" on the activity tab sets a pending scroll
  // target; consume on dashboard mount.
  useConsumeScrollTarget("activated-apps");

  // Light up Missions buttons briefly when the dashboard's empty-slot CTA
  // points users here. Listener cleared on unmount.
  useEffect(() => {
    const onFlash = () => {
      setFlashMissions(true);
      window.setTimeout(() => setFlashMissions(false), 1500);
    };
    window.addEventListener("uju:flash-missions", onFlash);
    return () => window.removeEventListener("uju:flash-missions", onFlash);
  }, []);

  return (
    <UjuCard>
      <div data-uju-scroll-target="activated-apps">
      <UjuSectionHeader
        accent
        title="Activated Apps, Services, and AI"
      />

      {pinnedApps.length === 0 ? (
        <div className="py-6 text-center space-y-3">
          <p className="text-base text-uju-secondary">No apps pinned yet.</p>
          <UjuButton variant="primary" size="sm" onClick={goToActivity}>
            Manage in App Directory →
          </UjuButton>
        </div>
      ) : (
        <>
          <ul className="space-y-2 mb-4">
            {pinnedApps.map((app) => (
              <li
                key={app.id}
                className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-uju-card/80 border border-uju-border/50 hover:border-pado-1/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-sm font-medium px-2 py-0.5 rounded-md tracking-wide ${CHAIN_BADGE_CLASS[app.chain]}`}
                  >
                    {CHAIN_LABEL[app.chain]}
                  </span>
                  <span className="text-base font-light text-uju-primary truncate">
                    {app.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Secondary action: edit which missions appear on dashboard */}
                  <UjuButton
                    variant="ghost"
                    size="xs"
                    onClick={() => setMissionsApp(app)}
                    aria-label={`Manage active engagement for ${app.name}`}
                    className={`!border-pado-2/60 !text-pado-2 hover:!border-pado-2 hover:!text-white hover:!bg-pado-2/10 ${
                      flashMissions ? "uju-flash-outline" : ""
                    }`}
                  >
                    Missions
                  </UjuButton>
                  {/* Primary row action: launch the app in a new tab */}
                  {app.url && app.url !== "#" ? (
                    <UjuButton
                      variant="accent"
                      size="xs"
                      as="a"
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${app.name}, opens in new tab`}
                      trailingIcon={
                        <svg
                          aria-hidden="true"
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14 5h5m0 0v5m0-5L10 14M5 7v12a2 2 0 002 2h12"
                          />
                        </svg>
                      }
                    >
                      Open
                    </UjuButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-center">
            <UjuButton
              variant="secondary"
              size="sm"
              onClick={goToActivity}
              trailingIcon={<span aria-hidden="true">→</span>}
            >
              Manage in App Directory
            </UjuButton>
          </div>
        </>
      )}
      </div>
      <UjuAppDetailsModal
        app={missionsApp}
        isOpen={!!missionsApp}
        onClose={() => setMissionsApp(null)}
      />
    </UjuCard>
  );
}
