import { FC, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  CHAIN_LABEL,
  CHAIN_BADGE_CLASS,
  type AppEntry,
} from "./appRegistry";
import { APP_MISSION_MAP, MAX_DAILY_MISSIONS } from "../missions/missionRegistry";
import { useUjuAppDirectory } from "./UjuAppDirectoryProvider";

interface UjuAppDetailsModalProps {
  app: AppEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

// Renders an app's full description + daily-mission checklist in a portal.
//
// Mission selection here uses `directory.toggleMission`, which writes to
// `state.missions[appId]`. As soon as a mission is selected, `effectivePinned`
// includes the app via mission-derived pinning (see useAppDirectory). So the
// modal works the same for activated and not-yet-activated apps — the user
// does not need to click Activate first.
export const UjuAppDetailsModal: FC<UjuAppDetailsModalProps> = ({
  app,
  isOpen,
  onClose,
}) => {
  const directory = useUjuAppDirectory();
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // ESC to close.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Body scroll lock.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Autofocus close button on open (return-focus to trigger is handled by
  // the trigger button's parent component since React preserves the DOM
  // focus stack as expected when the modal unmounts).
  useEffect(() => {
    if (!isOpen) return;
    closeBtnRef.current?.focus();
  }, [isOpen]);

  if (!isOpen || !app) return null;

  const isComingSoon = app.status === "coming-soon";
  const missions = APP_MISSION_MAP[app.id] ?? [];
  const selectedIds = directory.state.missions[app.id];
  const isMissionChecked = (id: string) => {
    if (selectedIds === undefined) return false;
    return selectedIds.includes(id);
  };

  const showCapBanner = directory.isAtCap;
  const hasUrl = app.url && app.url !== "#";

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-uju-bg/90 backdrop-blur-sm z-[9999] animate-in fade-in-0"
        onClick={onClose}
      />
      {/* Content */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed left-[50%] top-[50%] z-[10000] translate-x-[-50%] translate-y-[-50%] bg-uju-card border border-uju-border/30 p-6 sm:p-8 rounded-lg max-w-md w-[calc(100%-2rem)] max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
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
              {isComingSoon && (
                <span className="text-sm text-uju-secondary border border-uju-border rounded px-1.5 py-0.5">
                  Soon
                </span>
              )}
            </div>
            <h2
              id={titleId}
              className="text-xl font-semibold text-uju-primary"
            >
              {app.name}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="shrink-0 text-uju-secondary hover:text-uju-primary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-base text-uju-secondary leading-relaxed mb-4">
          {app.description}
        </p>

        {/* External link */}
        {hasUrl && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-base font-normal text-pado-2 hover:text-pado-4 transition-colors mb-6"
          >
            Visit website
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 5v14a2 2 0 002 2h12a2 2 0 002-2v-4" />
            </svg>
          </a>
        )}

        {/* Daily Missions */}
        {missions.length > 0 && (
          <>
            <div className="border-t border-uju-border/30 pt-4 mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em]">
                Daily Missions
              </h3>
              <span className="text-sm font-mono text-uju-secondary">
                {selectedIds?.length ?? 0}/{missions.length}
              </span>
            </div>

            {showCapBanner && (
              <div className="mb-3 px-3 py-2 rounded-md bg-pado-5/10 border border-pado-5/30 text-sm font-light text-pado-5">
                Daily mission cap reached ({MAX_DAILY_MISSIONS}/{MAX_DAILY_MISSIONS}). Deselect missions in other apps first.
              </div>
            )}

            <ul className="space-y-1.5">
              {missions.map((m) => {
                const checked = isMissionChecked(m.id);
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-normal text-uju-primary">
                            {m.label}
                          </span>
                          {m.points !== undefined && m.points > 0 && (
                            <span className="text-sm font-mono text-pado-4">
                              +{m.points} score
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-uju-secondary leading-snug mt-0.5">
                          {m.description}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {missions.length === 0 && (
          <div className="border-t border-uju-border/30 pt-4">
            <p className="text-sm font-light text-uju-secondary text-center py-2">
              No daily missions available for this app yet.
            </p>
          </div>
        )}
      </div>
    </>
  );

  return createPortal(modal, document.body);
};
