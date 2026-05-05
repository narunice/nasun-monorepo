import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../../ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { DividerBox } from "../../ui";
import { formatDate, DIALOG_CONTENT_CLASS } from "../utils";

interface SuccessStateProps {
  walletAddress?: string;
  joinedAt?: string;
  onClose: () => void;
  onWithdraw: () => void;
}

export function SuccessState({ walletAddress, joinedAt, onClose, onWithdraw }: SuccessStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-nasun-white">
          <CheckCircle2 className="h-6 w-6" />
          <span>{t("whitelist.modal.success.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.success.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <DividerBox
          color="w1"
          titleClassName="text-base"
          icon={<CheckCircle2 className="w-5 h-5" />}
          title={t("whitelist.modal.success.walletAddress")}
          padding="sm"
          className="!p-3"
        >
          <code className="text-nasun-white/80 break-all font-mono text-xs/snug md:text-sm/snug xl:text-base/snug">
            {walletAddress}
          </code>
        </DividerBox>

        {joinedAt && (
          <p className="text-center text-nasun-white/80 text-xs/snug md:text-sm/snug xl:text-base/snug">
            {t("whitelist.modal.success.joinedAt")}:{" "}
            <strong className="text-nasun-white">{formatDate(joinedAt)}</strong>
          </p>
        )}
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-3">
        <Button variant="outlineC5" size="md" onClick={onWithdraw} className="w-full sm:w-auto">
          {t("whitelist.modal.success.withdraw")}
        </Button>
        <Button variant="c5" size="md" onClick={onClose} className="w-full sm:w-auto">
          {t("whitelist.modal.success.close")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
