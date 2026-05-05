import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../ui/dialog";
import { DividerBox, InlineLoading } from "../../ui";
import { formatWalletAddress, DIALOG_CONTENT_CLASS } from "../utils";

interface SigningStateProps {
  walletAddress?: string;
}

export function SigningState({ walletAddress }: SigningStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 text-nasun-c2">
          <InlineLoading size="md" />
          <span>{t("whitelist.modal.signing.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.signing.description")}
        </DialogDescription>
      </DialogHeader>

      {walletAddress && (
        <div className="py-4">
          <DividerBox color="c2" padding="sm" className="!p-3">
            <p className="flex items-center gap-2 text-xs/snug md:text-sm/snug xl:text-base/snug">
              <span>✍️</span>
              <span>
                Wallet:{" "}
                <code className="text-nasun-c2 font-mono">
                  {formatWalletAddress(walletAddress)}
                </code>
              </span>
            </p>
          </DividerBox>
        </div>
      )}
    </DialogContent>
  );
}
