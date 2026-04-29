import { useState, useMemo } from "react";
import {
  APP_REGISTRY,
  CHAIN_LABEL,
  CHAIN_BADGE_CLASS,
  type AppChain,
  type AppEntry,
} from "../../apps/appRegistry";
import { APP_MISSION_MAP, MAX_DAILY_MISSIONS } from "../../missions/missionRegistry";
import { useUjuAppDirectory } from "../../apps/UjuAppDirectoryProvider";

const CHAIN_FILTERS: Array<{ value: AppChain | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "nasun", label: "Nasun" },
];

export function UjuAppDirectoryCard() {
  const directory = useUjuAppDirectory();
  const [activeChain, setActiveChain] = useState<AppChain | "all">("all");

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

  return (
    <div className="bg-uju-card border border-uju-border rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-uju-border">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-uju-primary">
            Apps, Services, and AI Directory
          </h3>
          <p className="text-sm text-uju-secondary mt-0.5">
            Activate apps to add their daily missions to your dashboard.
          </p>
        </div>
        <span className={`text-sm font-mono shrink-0 ${counterClass}`}>
          {directory.selectedTotal}/{MAX_DAILY_MISSIONS}
        </span>
      </div>

      {/* Chain filter */}
      <div className="flex gap-1 px-5 py-3 border-b border-uju-border overflow-x-auto">
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
      <ul className="divide-y divide-uju-border">
        {filtered.map((app) => (
          <li key={app.id}>
            <AppDirectoryRow app={app} />
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-uju-border">
        <p className={`text-sm ${counterClass}`}>
          {directory.selectedTotal}/{MAX_DAILY_MISSIONS} missions selected
          {directory.isAtCap && " — deselect one to add another"}
        </p>
      </div>
    </div>
  );
}

function AppDirectoryRow({ app }: { app: AppEntry }) {
  const directory = useUjuAppDirectory();
  const isComingSoon = app.status === "coming-soon";
  const missions = APP_MISSION_MAP[app.id] ?? [];
  const isActive = directory.isPinned(app.id);
  const selectedIds = directory.state.missions[app.id];

  const isMissionChecked = (id: string) => {
    if (selectedIds === undefined) return true;
    return selectedIds.includes(id);
  };

  return (
    <div className="px-5 py-4">
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
              className={`text-sm font-medium px-1.5 py-0.5 rounded ${
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
        <div className="shrink-0">
          {isComingSoon ? (
            <span className="text-sm text-uju-secondary px-3 py-1.5 border border-uju-border rounded">
              Soon
            </span>
          ) : isActive ? (
            <button
              onClick={() => directory.deactivate(app.id)}
              className="text-sm font-medium text-pado-2 border border-pado-2/30 rounded px-3 py-1.5 hover:bg-pado-2/10 transition-colors"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => directory.activate(app.id)}
              className="text-sm font-medium text-uju-primary border border-pado-4/40 bg-pado-4/10 rounded px-3 py-1.5 hover:bg-pado-4/20 transition-colors"
            >
              Activate
            </button>
          )}
        </div>
      </div>

      {/* Inline missions (only when active and has missions) */}
      {isActive && missions.length > 0 && (
        <ul className="mt-3 ml-5 space-y-1.5">
          {missions.map((m) => {
            const checked = isMissionChecked(m.id);
            // Disable unchecked checkboxes when at cap so the user has a clear
            // visual signal rather than a silent click-no-op.
            const disabled = !checked && directory.isAtCap;
            return (
              <li key={m.id}>
                <label
                  className={`flex items-start gap-3 px-2 py-2 rounded ${
                    disabled
                      ? "opacity-60 cursor-not-allowed"
                      : "hover:bg-uju-bg/30 cursor-pointer"
                  }`}
                  title={
                    disabled
                      ? `${MAX_DAILY_MISSIONS}/${MAX_DAILY_MISSIONS} — deselect one to add another`
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => directory.toggleMission(app.id, m.id)}
                    className="mt-1 shrink-0 w-4 h-4 accent-pado-2"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-uju-primary">
                        {m.label}
                      </span>
                      {m.points !== undefined && m.points > 0 && (
                        <span className="text-sm font-mono text-pado-4">
                          +{m.points}pt
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-uju-secondary leading-snug">
                      {m.description}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
