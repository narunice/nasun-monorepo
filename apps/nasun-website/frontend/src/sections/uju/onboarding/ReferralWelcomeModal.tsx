/**
 * Welcome modal for users who signed up via a referral link.
 *
 * Soft gate: closeable, page remains fully interactive while open. Bonus
 * activation requires X account link + admin manual approval (admin
 * verifies @Nasun_io follow off-band).
 *
 * Dismissal: per-device localStorage with "Don't show again". Modal still
 * appears on every login until dismissed; closing without the checkbox
 * shows it again next session.
 */

import { FC, useState, useCallback } from "react";
import { useAccountLinking } from "@/sections/myAccount/hooks/useAccountLinking";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const REFERRAL_MODAL_DISMISSED_KEY = "referralModalDismissedAt";

interface ReferralWelcomeModalProps {
  open: boolean;
  onClose: () => void;
  user: { identityId?: string; cognitoToken?: string; twitterId?: string } | null;
}

export const ReferralWelcomeModal: FC<ReferralWelcomeModalProps> = ({
  open,
  onClose,
  user,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  // Cast: useAccountLinking expects User from @/types/user; the structural
  // shape we pass matches at runtime (identityId + cognitoToken).
  const { handleLinkTwitter, isLinking } = useAccountLinking({ user: user as never });
  const xLinked = Boolean(user?.twitterId);

  const closeModal = useCallback(() => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(REFERRAL_MODAL_DISMISSED_KEY, String(Date.now()));
      } catch {
        // ignore (e.g., Safari private mode)
      }
    }
    onClose();
  }, [dontShowAgain, onClose]);

  const openFollowTab = useCallback(() => {
    window.open("https://x.com/Nasun_io", "_blank", "noopener,noreferrer");
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeModal(); }}>
      <DialogContent
        className="max-w-md overflow-hidden border-0 bg-transparent p-0 shadow-2xl sm:rounded-2xl"
      >
        {/* Outer card: light, warm gradient with a soft top accent. */}
        <div className="relative rounded-2xl bg-gradient-to-br from-white via-sky-50 to-cyan-50 text-nasun-black">
          {/* Decorative top accent stripe */}
          <div className="h-1.5 w-full bg-gradient-to-r from-nasun-c3 via-nasun-c4 to-nasun-c5 rounded-t-2xl" />

          {/* Floating sparkle badge */}
          <div className="absolute -top-3 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-nasun-c4 to-nasun-c5 text-white shadow-md ring-4 ring-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M12 2l1.8 4.6L18 8.4l-4.2 1.8L12 14.8l-1.8-4.6L6 8.4l4.2-1.8L12 2zM18 14l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5zM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14z" />
            </svg>
          </div>

          <div className="px-7 pt-7 pb-6">
            <h2 className="text-xl font-semibold leading-tight text-nasun-c6">
              Welcome! Activate your referral bonus
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Two quick steps unlock <span className="font-semibold text-nasun-c5">10% bonus points</span> on
              your activity. Your referrer earns the same. Bonuses start once an admin reviews your account.
            </p>

            {/* Step 1: X link */}
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    xLinked
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gradient-to-br from-nasun-c4 to-nasun-c5 text-white shadow-sm",
                  ].join(" ")}
                >
                  {xLinked ? "✓" : "1"}
                </span>
                <div>
                  <p className="text-sm font-medium text-nasun-c6">Connect your X account</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Required for review and identity verification.
                  </p>
                </div>
              </div>
              {xLinked ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  Connected
                </span>
              ) : (
                <button
                  onClick={handleLinkTwitter}
                  disabled={isLinking}
                  className="shrink-0 rounded-full bg-gradient-to-r from-nasun-c4 to-nasun-c5 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:shadow-md hover:brightness-110 active:scale-95 disabled:opacity-60"
                >
                  {isLinking ? "Connecting..." : "Connect"}
                </button>
              )}
            </div>

            {/* Step 2: Follow @Nasun_io */}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-nasun-c3 to-nasun-c4 text-sm font-semibold text-white shadow-sm">
                  2
                </span>
                <div>
                  <p className="text-sm font-medium text-nasun-c6">Follow @Nasun_io on X</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Admin verifies your follow before approval.
                  </p>
                </div>
              </div>
              <button
                onClick={openFollowTab}
                className="shrink-0 rounded-full border border-nasun-c4/40 bg-white px-4 py-1.5 text-sm font-medium text-nasun-c5 transition hover:bg-nasun-c4/10 active:scale-95"
              >
                Open X
              </button>
            </div>

            {/* Info note */}
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-sky-100">
              <span aria-hidden className="text-nasun-c4">ℹ</span>
              <span>You can use Nasun normally without activating. The bonus is optional.</span>
            </div>

            {/* Dismiss controls */}
            <div className="mt-5 flex items-center justify-between border-t border-sky-100 pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="h-4 w-4 accent-nasun-c4"
                />
                Don't show again
              </label>
              <button
                onClick={closeModal}
                className="rounded-full bg-slate-900/5 px-5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-900/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
