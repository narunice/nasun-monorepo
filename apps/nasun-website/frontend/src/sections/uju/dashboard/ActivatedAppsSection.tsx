import { useSearchParams } from "react-router-dom";
import { UjuCard, UjuButton, UjuSectionHeader } from "../shared";
import type { UseAppDirectoryResult } from "../apps/useAppDirectory";
import { CHAIN_LABEL, CHAIN_BADGE_CLASS } from "../apps/appRegistry";

interface ActivatedAppsSectionProps {
  directory: UseAppDirectoryResult;
}

export function ActivatedAppsSection({ directory }: ActivatedAppsSectionProps) {
  const [, setSearchParams] = useSearchParams();
  const { pinnedApps } = directory;

  const goToActivity = () =>
    setSearchParams({ tab: "activity" }, { replace: true });

  return (
    <UjuCard>
      <UjuSectionHeader
        accent
        title="Activated Apps, Services, and AI"
        trailing={
          pinnedApps.length > 0 ? (
            <span className="text-base font-light text-pado-5 tabular-nums">
              {pinnedApps.length}
            </span>
          ) : null
        }
      />

      {pinnedApps.length === 0 ? (
        <div className="py-6 text-center space-y-3">
          <p className="text-base text-uju-secondary">No apps pinned yet.</p>
          <UjuButton variant="secondary" size="sm" onClick={goToActivity}>
            Manage in Activity tab →
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
                {app.url && app.url !== "#" ? (
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${app.name}, opens in new tab`}
                    className="text-base font-light text-pado-2 hover:text-pado-5 transition-colors shrink-0"
                  >
                    Open ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <UjuButton variant="ghost" size="sm" fullWidth onClick={goToActivity}>
            Manage in Activity tab →
          </UjuButton>
        </>
      )}
    </UjuCard>
  );
}
