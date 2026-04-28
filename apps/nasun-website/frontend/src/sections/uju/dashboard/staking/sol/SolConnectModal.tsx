// Inline modal for "Connect Solana wallet" CTA from StakingCard SOL row.
// Wraps SolAddressInput so the CTA stays on the dashboard (no navigate).

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SolAddressInput } from "./SolAddressInput";

interface SolConnectModalProps {
  open: boolean;
  onClose: () => void;
  identityId: string;
}

export function SolConnectModal({ open, onClose, identityId }: SolConnectModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="dark bg-uju-card border-uju-border p-5 sm:p-6 max-w-md">
        <DialogTitle className="!text-white text-lg sm:text-xl font-semibold mb-1">
          Connect Solana Wallet
        </DialogTitle>
        <p className="text-sm text-uju-secondary mb-4">
          Read-only display. Staking actions happen on Marinade / Jito / Sanctum,
          not in uju.
        </p>
        <SolAddressInput identityId={identityId} compact onSaved={onClose} />
      </DialogContent>
    </Dialog>
  );
}
