// WalletModal.tsx
// Simplified to SUI-only after IOTA removal
import { ConnectButton as ConnectSuiWalletButton } from "@mysten/dapp-kit";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogOverlay,
} from "../../../components/ui/dialog";

export const WalletModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogOverlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-50" />
      <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg max-h-[85vh] bg-gray-800 rounded-lg shadow-xl z-50 overflow-auto p-6">
        <DialogTitle className="text-lg font-bold mb-4 text-white">
          Connect SUI Wallet
        </DialogTitle>
        <DialogDescription className="sr-only">
          Connect your SUI wallet to continue
        </DialogDescription>

        <div className="flex space-x-4">
          <div className="flex w-1/2 justify-center">
            <ConnectSuiWalletButton className="sui-connect-button" />
          </div>
          <div className="flex w-1/2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg w-full text-white"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
