import { useTranslation } from "react-i18next";
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
import { formatDate, DIALOG_CONTENT_CLASS } from "../utils";

interface AlreadyJoinedStateProps {
  walletAddress?: string;
  joinedAt?: string;
  onClose: () => void;
  onWithdraw: () => void;
}

export function AlreadyJoinedState({ walletAddress, joinedAt, onClose, onWithdraw }: AlreadyJoinedStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-nasun-c4">
          <AlertCircle className="h-6 w-6" />
          <span>{t("whitelist.modal.alreadyJoined.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.alreadyJoined.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <DividerBox
          color="c4"
          icon={<AlertCircle className="w-5 h-5" />}
          title={t("whitelist.modal.alreadyJoined.walletAddress")}
          padding="sm"
          className="!p-3"
        >
          <code className="text-nasun-c4 break-all font-mono text-xs/snug md:text-sm/snug xl:text-base/snug">
            {walletAddress}
          </code>
        </DividerBox>

        {joinedAt && (
          <p className="text-center text-nasun-white/80 text-xs/snug md:text-sm/snug xl:text-base/snug">
            {t("whitelist.modal.alreadyJoined.joinedAt")}:{" "}
            <strong className="text-nasun-white">{formatDate(joinedAt)}</strong>
          </p>
        )}
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-3">
        <Button variant="outlineC4" size="md" onClick={onWithdraw} className="w-full sm:w-auto">
          {t("whitelist.modal.alreadyJoined.withdraw")}
        </Button>
        <Button variant="c4" size="md" onClick={onClose} className="w-full sm:w-auto">
          {t("whitelist.modal.alreadyJoined.close")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
