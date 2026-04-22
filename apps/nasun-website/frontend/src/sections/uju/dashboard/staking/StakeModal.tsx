import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StakingPanel } from "@nasun/wallet-ui";

interface StakeModalProps {
  open: boolean;
  onClose: () => void;
}

export function StakeModal({ open, onClose }: StakeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      {/*
       * dark: forces StakingPanel dark: variants active even when user switches to light mode.
       * bg-uju-card: StakingPanel top-level div has no background color.
       * overflow-y-auto max-h-[85vh]: keeps ValidatorList scroll inside the modal.
       */}
      <DialogContent className="dark bg-uju-card border-uju-border overflow-y-auto max-h-[85vh] p-0">
        <DialogTitle className="sr-only">NSN Staking</DialogTitle>
        <StakingPanel compact onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
