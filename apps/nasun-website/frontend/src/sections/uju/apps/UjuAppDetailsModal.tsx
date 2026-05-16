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
import { AppWalletBindingSection, isEvmBindableChain } from "./AppWalletBindingSection";

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

  const modal = (
    <>
      {/* Backdrop — matches the rest of uju (dark glass with blur). */}
      <div
        className="fixed inset-0 bg-gray-950/50 backdrop-blur-md z-[9999] animate-in fade-in-0"
        onClick={onClose}
      />
      {/* Content — header is fixed, the mission list scrolls within the
          modal so long lists stay manageable. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed left-[50%] top-[50%] z-[10000] translate-x-[-50%] translate-y-[-50%] bg-uju-card border border-uju-border/60 rounded-lg max-w-md w-[calc(100%-2rem)] max-h-[calc(100vh-4rem)] flex flex-col shadow-2xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (fixed) */}
        <div className="flex items-start justify-between gap-3 p-6 sm:p-7 pb-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={`text-sm font-medium px-2 py-0.5 rounded-md tracking-wide ${
                  isComingSoon
                    ? "text-uju-secondary bg-uju-border/40"
                    : CHAIN_BADGE_CLASS[app.chain]
                }`}
              >
                {CHAIN_LABEL[app.chain]}
              </span>
              {isComingSoon && (
                <span className="inline-flex items-center rounded-md bg-uju-border/40 text-uju-secondary px-2 py-0.5 text-sm font-light leading-tight">
                  Coming Soon
                </span>
              )}
            </div>
            <h2 id={titleId} className="text-xl font-semibold text-uju-primary">
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

        {/* Mission list (scrolls). The modal intentionally omits the app
            description and external link — uju's app directory already
            covers that. The Missions button inside the dashboard row is a
            quick-pick UX for daily-mission selection only. */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-7 pb-6 sm:pb-7">
          {missions.length > 0 ? (
            <>
              <div className="border-t border-uju-border/30 pt-4 mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em]">
                  Active Engagement
                </h3>
                <span className="text-sm font-mono text-uju-secondary">
                  {selectedIds?.length ?? 0}/{missions.length}
                </span>
              </div>

              {showCapBanner && (
                <div className="mb-3 px-3 py-2 rounded-md bg-pado-5/10 border border-pado-5/30 text-sm font-light text-pado-5">
                  Active engagement cap reached ({MAX_DAILY_MISSIONS}/{MAX_DAILY_MISSIONS}). Deselect missions in other apps first.
                </div>
              )}

              <ul className="space-y-1.5">
                {missions.map((m) => {
                  const checked = isMissionChecked(m.id);
                  const disabled = !checked && directory.isAtCap;
                  return (
                    <li key={m.id}>
                      <label
                        className={`flex items-center gap-3 px-2 py-2 rounded ${
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
                          className="shrink-0 w-4 h-4 accent-pado-2"
                        />
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-base font-normal text-uju-primary">
                            {m.label}
                          </span>
                          {m.points !== undefined && m.points > 0 && (
                            <span className="text-sm font-mono text-pado-4">
                              +{m.points} score
                            </span>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="border-t border-uju-border/30 pt-4">
              <p className="text-sm font-light text-uju-secondary text-center py-2">
                No active engagement options available for this app yet.
              </p>
            </div>
          )}

          {/* Per-app wallet binding picker — EVM chains only. Mounted in
              both this mission modal and the activity-tab info modal so
              the user can switch the bound wallet from wherever they
              opened the app's surface. Section self-gates on chain and on
              whether the user has verified additional wallets. */}
          {!isComingSoon && isEvmBindableChain(app.chain) && (
            <AppWalletBindingSection
              appId={app.id}
              appName={app.name}
              chain={app.chain}
            />
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
};
