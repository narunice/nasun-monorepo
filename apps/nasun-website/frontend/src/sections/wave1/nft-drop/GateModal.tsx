import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ButtonV3 } from "@/components/ui/button-v3";
import { GENESIS_LORE_LINES } from "@/constants/nft-drop";
import type { EligibilityData } from "@/hooks/useDropPageState";

interface GateModalProps {
  open: boolean;
  eligible: boolean;
  eligibility: EligibilityData;
  onProceed: () => void;
  onClose: () => void;
}

function isLoreSeen(): boolean {
  try { return sessionStorage.getItem("nasun:lore-seen") === "1"; } catch { return false; }
}

export function GateModal({ open, eligible, eligibility, onProceed, onClose }: GateModalProps) {
  return eligible
    ? <EligibleGate open={open} onProceed={onProceed} />
    : <IneligibleGate open={open} eligibility={eligibility} onClose={onClose} />;
}

// -- Eligible Gate --

function EligibleGate({ open, onProceed }: { open: boolean; onProceed: () => void }) {
  const [animStep, setAnimStep] = useState(0); // 0=enter, 1=lore
  const [showProceed, setShowProceed] = useState(false);
  const skipAnimation = isLoreSeen();

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        className="max-w-md border border-amber-400/15"
        style={{ background: "rgba(18,14,26,1)" }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Genesis Pass Entrance</DialogTitle>

        <AnimatePresence mode="wait">
          {animStep === 0 && (
            <motion.div
              key="enter"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-6 py-8 px-4 text-center"
            >
              <p className="text-amber-400 text-lg font-semibold tracking-wide">
                You are allowed to enter
              </p>
              <ButtonV3
                variant="c1-gradient"
                size="xl"
                className="!px-12 !py-3.5 !text-base !font-semibold !rounded-xl"
                autoFocus
                onClick={() => setAnimStep(1)}
              >
                Enter
              </ButtonV3>
            </motion.div>
          )}

          {animStep === 1 && (
            <motion.div
              key="lore"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-8 py-8 px-4 text-center"
            >
              {/* Fixed-height container: all lines always occupy space, only opacity animates */}
              <div className="max-w-sm">
                {GENESIS_LORE_LINES.map((line, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      delay: skipAnimation ? 0 : 0.8 + i * 2.0,
                      duration: skipAnimation ? 0.2 : 2.5,
                      ease: [0.25, 0.1, 0.25, 1],
                    }}
                    onAnimationComplete={() => {
                      if (i === GENESIS_LORE_LINES.length - 1) {
                        setShowProceed(true);
                      }
                    }}
                    className="text-nasun-white/80 text-base leading-relaxed"
                  >
                    {line}
                    {i === 0 ? <br /> : i < GENESIS_LORE_LINES.length - 1 ? " " : ""}
                  </motion.span>
                ))}
              </div>

              {/* Proceed button: always in layout, only opacity changes */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: showProceed ? 1 : 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{ pointerEvents: showProceed ? "auto" : "none" }}
              >
                <ButtonV3
                  variant="c1-gradient"
                  size="xl"
                  className="!px-12 !py-3.5 !text-base !font-semibold !rounded-xl"
                  autoFocus
                  onClick={onProceed}
                >
                  Proceed
                </ButtonV3>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// -- Ineligible Gate --

function IneligibleGate({
  open,
  eligibility,
  onClose,
}: {
  open: boolean;
  eligibility: EligibilityData;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        hideCloseButton
        className="max-w-md border border-amber-400/15"
        style={{ background: "rgba(18,14,26,1)" }}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Not Eligible</DialogTitle>

        <div className="flex flex-col items-center gap-5 py-6 px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f9a824" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <p className="text-nasun-white text-lg font-semibold">
            You are not eligible for this stage
          </p>

          {eligibility.registered && eligibility.eligibleStageLabel && (
            <p className="text-nasun-white/70 text-sm leading-relaxed">
              Your wallet is registered for{" "}
              <span className="text-amber-400 font-medium">{eligibility.eligibleStageLabel}</span>.
              {eligibility.currentStageLabel && (
                <> Current stage: {eligibility.currentStageLabel}.</>
              )}
            </p>
          )}

          {eligibility.registered && !eligibility.eligible
            && eligibility.eligibleStage != null
            && eligibility.currentStageLabel
            && eligibility.eligibleStageLabel !== eligibility.currentStageLabel && (
            <p className="text-amber-300/90 text-sm leading-relaxed mt-1">
              You can still mint during Public Mint.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 w-full mt-2">
            <button
              className="py-3 rounded-xl text-sm font-semibold border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 transition-colors"
              onClick={() => navigate("/")}
            >
              Go to Home
            </button>
            <button
              className="py-3 rounded-xl text-sm font-semibold border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
