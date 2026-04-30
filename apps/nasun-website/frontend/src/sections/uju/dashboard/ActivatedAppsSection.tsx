import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UjuCard, UjuButton, UjuSectionHeader } from "../shared";
import { goToActivityDirectory, consumeScrollTarget } from "../shared/ujuNavigation";
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

  const goToActivity = () => goToActivityDirectory(setSearchParams);

  // Receive scroll-to-section requests from the activity tab "Go to
  // Activated Apps →" button. Only consume the target if it matches our
  // anchor; otherwise leave it for whoever owns it.
  useEffect(() => {
    const target = sessionStorage.getItem("uju:scrollTarget");
    if (target !== "activated-apps") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-uju-scroll-target="${target}"]`);
        if (el) {
          // Match consume-then-scroll order with ActivityTab.
          consumeScrollTarget();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
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
          <UjuButton variant="secondary" size="sm" onClick={goToActivity}>
            Manage in App Directory →
          </UjuButton>
        </div>
      ) : (
        <>
          <ul className="space-y-2 mb-4">
            {pinnedApps.map((app) => (
              <li
                key={app.id}
                className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-uju-bg/40 border border-uju-border/60 hover:border-pado-1/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-sm font-light px-2 py-0.5 rounded-full ${CHAIN_BADGE_CLASS[app.chain]}`}
                  >
                    {CHAIN_LABEL[app.chain]}
                  </span>
                  <span className="text-base font-light text-uju-primary truncate">
                    {app.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMissionsApp(app)}
                    className="text-base font-light text-uju-secondary hover:text-pado-3 transition-colors"
                    aria-label={`Manage daily missions for ${app.name}`}
                  >
                    Missions
                  </button>
                  {app.url && app.url !== "#" ? (
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${app.name}, opens in new tab`}
                      className="text-base font-light text-pado-2 hover:text-pado-5 transition-colors"
                    >
                      Open ↗
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <UjuButton variant="ghost" size="sm" fullWidth onClick={goToActivity}>
            Manage in App Directory →
          </UjuButton>
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
