import { useState, useEffect, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  APP_REGISTRY,
  CHAIN_LABEL,
  CHAIN_BADGE_CLASS,
  type AppChain,
  type AppEntry,
} from "./appRegistry";
import type { UseAppDirectoryResult } from "./useAppDirectory";
import { APP_MISSION_MAP, BASE_MISSIONS } from "../missions/missionRegistry";

// --- Icons ---

function XIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// --- Chain filter tabs ---

const CHAIN_FILTERS: Array<{ value: AppChain | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "nasun", label: "Nasun" },
  { value: "solana", label: "Solana" },
  { value: "sui", label: "SUI" },
  { value: "ethereum", label: "Ethereum" },
];

// --- App row (list view) ---

function AppRow({
  app,
  effectivePinned,
  onSelect,
}: {
  app: AppEntry;
  effectivePinned: boolean;
  onSelect: () => void;
}) {
  const isComingSoon = app.status === "coming-soon";

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        isComingSoon
          ? "border-uju-border/50 hover:border-uju-border"
          : "border-uju-border hover:border-pado-2/40 hover:bg-uju-bg/30"
      }`}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 w-2.5 h-2.5 rounded-full ${
          effectivePinned ? "bg-pado-4" : "bg-uju-border"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              isComingSoon
                ? "text-uju-secondary bg-uju-border/30"
                : CHAIN_BADGE_CLASS[app.chain]
            }`}
          >
            {CHAIN_LABEL[app.chain]}
          </span>
          <span
            className={`text-sm font-semibold truncate ${
              isComingSoon ? "text-uju-secondary" : "text-uju-primary"
            }`}
          >
            {app.name}
          </span>
          {isComingSoon && (
            <span className="text-xs text-uju-secondary border border-uju-border rounded px-1.5 py-0.5 shrink-0">
              Soon
            </span>
          )}
        </div>
        <p className="text-sm text-uju-secondary leading-snug truncate">
          {app.description}
        </p>
      </div>
      <span className="shrink-0 text-uju-secondary">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

// --- App detail (one app, expanded view) ---

function AppDetail({
  app,
  selected,
  effectivePinned,
  onBack,
  onActivate,
  onDeactivate,
  onToggleMission,
}: {
  app: AppEntry;
  selected: string[] | undefined;
  effectivePinned: boolean;
  onBack: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onToggleMission: (missionId: string) => void;
}) {
  const isComingSoon = app.status === "coming-soon";
  const missions = APP_MISSION_MAP[app.id] ?? [];
  const isMissionChecked = (id: string) => {
    if (selected === undefined) return true; // fallback: show all
    return selected.includes(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header (replaces list header) */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-uju-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            aria-label="Back to app list"
            className="text-uju-secondary hover:text-uju-primary transition-colors"
          >
            <BackIcon />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                isComingSoon
                  ? "text-uju-secondary bg-uju-border/30"
                  : CHAIN_BADGE_CLASS[app.chain]
              }`}
            >
              {CHAIN_LABEL[app.chain]}
            </span>
            <span className="text-base font-semibold text-uju-primary truncate">
              {app.name}
            </span>
            {isComingSoon && (
              <span className="text-xs text-uju-secondary border border-uju-border rounded px-1.5 py-0.5 shrink-0">
                Soon
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-sm text-uju-secondary leading-relaxed">
          {app.description}
        </p>

        {/* Action row: Activate/Deactivate + Open */}
        <div className="flex items-center gap-2">
          {isComingSoon ? (
            <span className="text-sm text-uju-secondary px-3 py-1.5 border border-uju-border rounded">
              Coming Soon
            </span>
          ) : effectivePinned ? (
            <button
              onClick={onDeactivate}
              className="text-sm font-medium text-pado-2 border border-pado-2/30 rounded px-3 py-1.5 hover:bg-pado-2/10 transition-colors"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={onActivate}
              className="text-sm font-medium text-uju-primary border border-pado-4/40 bg-pado-4/10 rounded px-3 py-1.5 hover:bg-pado-4/20 transition-colors"
            >
              Activate
            </button>
          )}
          {!isComingSoon && app.url && app.url !== "#" && (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${app.name}, opens in new tab`}
              className="text-sm font-medium text-pado-2 border border-pado-2/30 rounded px-3 py-1.5 hover:bg-pado-2/10 transition-colors"
            >
              Open ↗
            </a>
          )}
        </div>

        {/* Daily missions */}
        <div className="pt-2 border-t border-uju-border">
          <h4 className="text-sm font-semibold text-uju-primary mb-3">
            Daily Missions
          </h4>
          {missions.length === 0 ? (
            <p className="text-sm text-uju-secondary italic">
              No daily missions available right now.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {missions.map((m) => {
                const checked = isMissionChecked(m.id);
                return (
                  <li key={m.id}>
                    <label className="flex items-start gap-3 px-2 py-2 rounded hover:bg-uju-bg/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleMission(m.id)}
                        className="mt-1 shrink-0 w-4 h-4 accent-pado-2"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-uju-primary">
                            {m.label}
                          </span>
                          {m.points !== undefined && m.points > 0 && (
                            <span className="text-xs font-mono text-pado-4">
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
      </div>
    </div>
  );
}

// --- Modal ---

export interface AppDirectoryModalProps {
  open: boolean;
  onClose: () => void;
  directory: UseAppDirectoryResult;
}

export function AppDirectoryModal({
  open,
  onClose,
  directory,
}: AppDirectoryModalProps) {
  const [activeChain, setActiveChain] = useState<AppChain | "all">("all");
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);

  // Reset to list view + chain filter when modal reopens
  useEffect(() => {
    if (open) {
      setActiveChain("all");
      setExpandedAppId(null);
    }
  }, [open]);

  const filtered = useMemo(
    () =>
      activeChain === "all"
        ? APP_REGISTRY
        : APP_REGISTRY.filter((a) => a.chain === activeChain),
    [activeChain],
  );

  // Informational counter: BASE missions + sum of explicitly-selected per-app
  const selectedMissionCount = useMemo(() => {
    const fromApps = Object.values(directory.state.missions).reduce(
      (n, ids) => n + ids.length,
      0,
    );
    return BASE_MISSIONS.length + fromApps;
  }, [directory.state.missions]);

  const expandedApp = expandedAppId
    ? APP_REGISTRY.find((a) => a.id === expandedAppId)
    : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 bg-uju-card border border-uju-border rounded-xl shadow-xl flex flex-col max-h-[90vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          {expandedApp ? (
            <>
              <Dialog.Title className="sr-only">
                {expandedApp.name} details
              </Dialog.Title>
              <AppDetail
                app={expandedApp}
                selected={directory.state.missions[expandedApp.id]}
                effectivePinned={directory.isPinned(expandedApp.id)}
                onBack={() => setExpandedAppId(null)}
                onActivate={() => directory.activate(expandedApp.id)}
                onDeactivate={() => directory.deactivate(expandedApp.id)}
                onToggleMission={(missionId) =>
                  directory.toggleMission(expandedApp.id, missionId)
                }
              />
              <Dialog.Close
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 text-uju-secondary hover:text-uju-primary transition-colors"
              >
                <XIcon />
              </Dialog.Close>
            </>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-uju-border shrink-0">
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold text-uju-primary">
                    App Directory
                  </Dialog.Title>
                  <p className="text-sm text-uju-secondary mt-0.5">
                    {selectedMissionCount} mission
                    {selectedMissionCount !== 1 ? "s" : ""} selected
                  </p>
                </div>
                <Dialog.Close
                  onClick={onClose}
                  className="text-uju-secondary hover:text-uju-primary transition-colors"
                  aria-label="Close"
                >
                  <XIcon />
                </Dialog.Close>
              </div>

              {/* Chain filter tabs */}
              <div className="flex gap-1 px-5 py-3 border-b border-uju-border shrink-0 overflow-x-auto">
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

              {/* App list */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {filtered.map((app) => (
                  <AppRow
                    key={app.id}
                    app={app}
                    effectivePinned={directory.isPinned(app.id)}
                    onSelect={() => setExpandedAppId(app.id)}
                  />
                ))}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-uju-border shrink-0">
                <p className="text-sm text-uju-secondary">
                  {filtered.length} app{filtered.length !== 1 ? "s" : ""} shown
                </p>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
