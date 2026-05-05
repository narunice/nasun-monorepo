import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { DividerBox, InlineLoading } from "../../ui";
import { formatWalletAddress, DIALOG_CONTENT_CLASS } from "../utils";

interface ConnectingStateProps {
  walletAddress?: string;
}

export function ConnectingState({ walletAddress }: ConnectingStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-nasun-c1">
          <InlineLoading size="md" />
          <span>{t("whitelist.modal.connecting.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {walletAddress
            ? t("whitelist.modal.connecting.checking")
            : t("whitelist.modal.connecting.description")}
        </DialogDescription>
      </DialogHeader>

      {walletAddress && (
        <div className="py-4">
          <DividerBox color="c1" padding="sm" className="!p-3">
            <p className="flex items-center gap-2 text-xs/snug md:text-sm/snug xl:text-base/snug">
              <span>🦊</span>
              <span>Wallet: <code className="text-nasun-c1 font-mono">{formatWalletAddress(walletAddress)}</code></span>
            </p>
          </DividerBox>
        </div>
      )}
    </DialogContent>
  );
}
