import { useTranslation } from "react-i18next";
import { XCircle } from "lucide-react";
import { Button } from "../../ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { DividerBox } from "../../ui";
import { formatWalletAddress, DIALOG_CONTENT_CLASS } from "../utils";

interface ErrorStateProps {
  walletAddress?: string;
  error?: string;
  onClose: () => void;
}

export function ErrorState({ walletAddress, error, onClose }: ErrorStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-nasun-coral">
          <XCircle className="h-6 w-6" />
          <span>{t("whitelist.modal.error.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.error.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <DividerBox
          color="coral"
          icon={<XCircle className="w-5 h-5" />}
          title={t("whitelist.modal.error.errorMessage")}
          padding="sm"
          className="!p-3"
        >
          <p className="text-nasun-coral text-xs/snug md:text-sm/snug xl:text-base/snug">
            {error || "An unexpected error occurred. Please try again."}
          </p>
        </DividerBox>

        {walletAddress && (
          <p className="text-center text-nasun-white/80 text-xs/snug md:text-sm/snug xl:text-base/snug">
            Wallet: <code className="text-nasun-white font-mono">{formatWalletAddress(walletAddress)}</code>
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="coral" size="md" onClick={onClose} className="w-full">
          {t("whitelist.modal.error.close")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
