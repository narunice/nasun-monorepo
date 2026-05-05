import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { AlertCircle } from "lucide-react";
import { Button } from "../../ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { DividerBox } from "../../ui";
import { formatWalletAddress, formatDate, DIALOG_CONTENT_CLASS } from "../utils";

interface AlreadyWithdrawnStateProps {
  walletAddress?: string;
  withdrawnAt?: string;
  onClose: () => void;
}

export function AlreadyWithdrawnState({ walletAddress, withdrawnAt, onClose }: AlreadyWithdrawnStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-nasun-c4">
          <AlertCircle className="h-6 w-6" />
          <span>{t("whitelist.modal.alreadyWithdrawn.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.alreadyWithdrawn.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <DividerBox
          color="c4"
          title={t("whitelist.modal.alreadyWithdrawn.walletAddress")}
          padding="sm"
          className="!p-3"
        >
          <code className="text-nasun-c4 break-all font-mono text-xs/snug md:text-sm/snug xl:text-base/snug">
            {walletAddress ? formatWalletAddress(walletAddress) : "N/A"}
          </code>
        </DividerBox>

        {withdrawnAt && (
          <p className="text-center text-nasun-white/80 text-xs/snug md:text-sm/snug xl:text-base/snug">
            {t("whitelist.modal.alreadyWithdrawn.withdrawnAt")}:{" "}
            <strong className="text-nasun-white">{formatDate(withdrawnAt)}</strong>
          </p>
        )}

        {walletAddress && (
          <DividerBox color="c4" padding="sm" className="!p-3">
            <p className="flex items-center gap-2 text-xs/snug md:text-sm/snug xl:text-base/snug">
              <span>💡</span>
              <span>Wallet: {walletAddress}</span>
            </p>
          </DividerBox>
        )}
      </div>

      <DialogFooter>
        <Button variant="c4" size="md" onClick={onClose} className="w-full">
          {t("whitelist.modal.alreadyWithdrawn.close")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
