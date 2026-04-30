import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  APP_REGISTRY,
  CHAIN_LABEL,
  CHAIN_BADGE_CLASS,
  type AppChain,
  type AppEntry,
} from "../../apps/appRegistry";
import {
  APP_MISSION_MAP,
  MAX_DAILY_MISSIONS,
} from "../../missions/missionRegistry";
import { useUjuAppDirectory } from "../../apps/UjuAppDirectoryProvider";
import { UjuAppDetailsModal } from "../../apps/UjuAppDetailsModal";
import { UjuCard, UjuButton, UjuSectionHeader } from "../../shared";
import { goToDashboardActivatedApps } from "../../shared/ujuNavigation";

const CHAIN_FILTERS: Array<{ value: AppChain | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "nasun", label: "Nasun" },
];

export function UjuAppDirectoryCard() {
  const directory = useUjuAppDirectory();
  const [, setSearchParams] = useSearchParams();
  const [activeChain, setActiveChain] = useState<AppChain | "all">("all");
  const [detailsApp, setDetailsApp] = useState<AppEntry | null>(null);

  const filtered = useMemo(
    () =>
      activeChain === "all"
        ? APP_REGISTRY
        : APP_REGISTRY.filter((a) => a.chain === activeChain),
    [activeChain],
  );

  const counterClass =
    directory.selectedTotal >= MAX_DAILY_MISSIONS
      ? "text-pado-5"
      : "text-uju-secondary";

  const trailing = (
    <span className={`text-base font-mono shrink-0 ${counterClass}`}>
      {directory.selectedTotal}/{MAX_DAILY_MISSIONS}
    </span>
  );

  return (
    <UjuCard
      className="animate-fade-slide-up"
      // Scroll target for "Manage in App Directory" buttons.
      // Note: data-uju-anchor is reserved for chat-height layout selectors;
      // scroll targets use a separate attribute namespace.
    >
      <div data-uju-scroll-target="apps-directory">
        <UjuSectionHeader
          accent
          title="Apps, Services, and AI Directory"
          subtitle="Activate apps to add their daily missions to your dashboard."
          trailing={trailing}
        />

        {/* Chain filter */}
        <div className="flex gap-1 py-3 overflow-x-auto">
          {CHAIN_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveChain(f.value)}
              className={`shrink-0 px-3 py-1 text-sm rounded-full border transition-colors ${
                activeChain === f.value
                  ? "text-pado-2 border-pado-2/40 bg-pado-2/10"
                  : "text-uju-secondary border-uju-border hover:text-uju-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* App rows */}
        <ul className="divide-y divide-uju-border/40">
          {filtered.map((app) => (
            <li key={app.id}>
              <AppDirectoryRow app={app} onShowDetails={setDetailsApp} />
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="pt-3 mt-2 border-t border-uju-border/40 space-y-3">
          <p className={`text-sm ${counterClass}`}>
            {directory.selectedTotal}/{MAX_DAILY_MISSIONS} missions selected
            {directory.isAtCap && " — deselect one to add another"}
          </p>
          <div className="flex justify-center">
            <UjuButton
              variant="secondary"
              size="sm"
              onClick={() => goToDashboardActivatedApps(setSearchParams)}
            >
              Go to Activated Apps →
            </UjuButton>
          </div>
        </div>
      </div>

      <UjuAppDetailsModal
        app={detailsApp}
        isOpen={!!detailsApp}
        onClose={() => setDetailsApp(null)}
      />
    </UjuCard>
  );
}

function AppDirectoryRow({
  app,
  onShowDetails,
}: {
  app: AppEntry;
  onShowDetails: (app: AppEntry) => void;
}) {
  const directory = useUjuAppDirectory();
  const isComingSoon = app.status === "coming-soon";
  const missions = APP_MISSION_MAP[app.id] ?? [];
  const totalMissions = missions.length;
  const isActive = directory.isPinned(app.id);
  // missions[appId] === undefined means user never opened the checklist for
  // this app — counter shows "0 selected" until the user toggles.
  const selectedCount = directory.state.missions[app.id]?.length ?? 0;

  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`shrink-0 mt-1 w-2.5 h-2.5 rounded-full ${
            isActive ? "bg-pado-4" : "bg-uju-border"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-sm font-light px-1.5 py-0.5 rounded ${
                isComingSoon
                  ? "text-uju-secondary bg-uju-border/30"
                  : CHAIN_BADGE_CLASS[app.chain]
              }`}
            >
              {CHAIN_LABEL[app.chain]}
            </span>
            <span
              className={`text-base font-semibold ${
                isComingSoon ? "text-uju-secondary" : "text-uju-primary"
              }`}
            >
              {app.name}
            </span>
            {totalMissions > 0 && (
              <span className="text-sm font-light text-uju-secondary tabular-nums">
                ({selectedCount}/{totalMissions} selected)
              </span>
            )}
            {isComingSoon && (
              <span className="text-sm text-uju-secondary border border-uju-border rounded px-1.5 py-0.5">
                Soon
              </span>
            )}
          </div>
          <p className="text-sm text-uju-secondary leading-snug">
            {app.description}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => onShowDetails(app)}
            className="text-sm font-light text-uju-primary border border-uju-border rounded px-3 py-1.5 hover:border-pado-2/40 hover:text-pado-2 transition-colors"
          >
            Details
          </button>
          {isComingSoon ? (
            <span className="text-sm text-uju-secondary px-3 py-1.5 border border-uju-border rounded">
              Soon
            </span>
          ) : isActive ? (
            <button
              onClick={() => directory.deactivate(app.id)}
              className="text-sm font-light text-pado-2 border border-pado-2/30 rounded px-3 py-1.5 hover:bg-pado-2/10 transition-colors"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => directory.activate(app.id)}
              className="text-sm font-light text-uju-primary border border-pado-4/40 bg-pado-4/10 rounded px-3 py-1.5 hover:bg-pado-4/20 transition-colors"
            >
              Activate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
