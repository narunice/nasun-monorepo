import { FC, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  CHAIN_LABEL,
  CHAIN_BADGE_CLASS,
  type AppEntry,
} from "./appRegistry";

interface UjuAppInfoModalProps {
  app: AppEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Full app information modal — opened by the Activity tab's "Details" button
 * on each app row. Shows the app's identity (name, chain, status), full
 * description, and website link.
 *
 * Mission selection lives in a different surface ([UjuAppDetailsModal]),
 * which is opened by the dashboard's "Missions" button. Splitting the two
 * modals avoids one giant component that mixed reading-about and
 * configuring-missions concerns.
 *
 * Layout: fixed height (capped at 70vh / max 540px) with internal scroll so
 * long descriptions stay manageable on small viewports.
 */
export const UjuAppInfoModal: FC<UjuAppInfoModalProps> = ({
  app,
  isOpen,
  onClose,
}) => {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    closeBtnRef.current?.focus();
  }, [isOpen]);

  if (!isOpen || !app) return null;

  const isComingSoon = app.status === "coming-soon";
  const hasUrl = app.url && app.url !== "#";

  const modal = (
    <>
      {/* Backdrop — matches the Missions modal so the two surfaces feel like
          the same family. */}
      <div
        className="fixed inset-0 bg-gray-950/50 backdrop-blur-md z-[9999] animate-in fade-in-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed left-[50%] top-[50%] z-[10000] translate-x-[-50%] translate-y-[-50%] bg-uju-card border border-uju-border/60 rounded-lg max-w-md w-[calc(100%-2rem)] h-[min(70vh,540px)] flex flex-col shadow-2xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="flex items-start justify-between gap-3 p-6 sm:p-7 pb-4 shrink-0 border-b border-uju-border/30">
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-7 py-5 space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em] mb-2">
              About
            </h3>
            <p className="text-base text-uju-primary leading-relaxed whitespace-pre-line">
              {app.description}
            </p>
          </section>

          {hasUrl && (
            <section>
              <h3 className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em] mb-2">
                Website
              </h3>
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-base font-medium text-pado-2 hover:text-pado-4 underline-offset-4 hover:underline transition-colors break-all"
              >
                {app.url.replace(/^https?:\/\//, "")}
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 5v14a2 2 0 002 2h12a2 2 0 002-2v-4"
                  />
                </svg>
              </a>
            </section>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
};
