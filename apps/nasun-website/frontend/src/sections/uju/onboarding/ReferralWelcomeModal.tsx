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
      <DialogContent className="max-w-md">
        <h2 className="text-lg font-semibold text-nasun-white mb-2">
          Welcome! Activate your referral bonus
        </h2>
        <p className="text-sm text-nasun-white/80 mb-5">
          Two steps unlock 10% bonus points on your activity. Your referrer
          earns the same. Bonuses start once an admin reviews your account.
        </p>

        {/* Step 1: X link */}
        <div className="flex items-center justify-between gap-3 py-3 border-t border-nasun-white/10">
          <div>
            <p className="text-sm text-nasun-white">
              <span className="mr-2">{xLinked ? "✓" : "1."}</span>
              Connect your X account
            </p>
            <p className="text-xs text-nasun-white/60 mt-0.5">
              Required for review and identity verification.
            </p>
          </div>
          {xLinked ? (
            <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400">
              Connected
            </span>
          ) : (
            <button
              onClick={handleLinkTwitter}
              disabled={isLinking}
              className="px-3 py-1.5 rounded bg-nasun-c4/30 hover:bg-nasun-c4/50 text-nasun-white text-sm disabled:opacity-50"
            >
              {isLinking ? "Connecting..." : "Connect"}
            </button>
          )}
        </div>

        {/* Step 2: Follow @Nasun_io */}
        <div className="flex items-center justify-between gap-3 py-3 border-t border-nasun-white/10">
          <div>
            <p className="text-sm text-nasun-white">
              <span className="mr-2">2.</span>
              Follow @Nasun_io on X
            </p>
            <p className="text-xs text-nasun-white/60 mt-0.5">
              Admin verifies your follow before approval.
            </p>
          </div>
          <button
            onClick={openFollowTab}
            className="px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm"
          >
            Open X
          </button>
        </div>

        <p className="text-xs text-nasun-white/60 mt-4">
          You can use Nasun normally without activating — the bonus is optional.
        </p>

        {/* Dismiss controls */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-nasun-white/10">
          <label className="flex items-center gap-2 text-sm text-nasun-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-nasun-c4"
            />
            Don't show again
          </label>
          <button
            onClick={closeModal}
            className="px-4 py-1.5 rounded bg-nasun-c4/30 hover:bg-nasun-c4/50 text-nasun-white text-sm"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
