import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { Button } from "../../ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { DividerBox } from "../../ui";
import { METAMASK_INSTALL_URL, DIALOG_CONTENT_CLASS } from "../utils";

interface IntroStateProps {
  onClose: () => void;
  onProceed: () => void;
}

export function IntroState({ onClose, onProceed }: IntroStateProps) {
  const { t } = useTranslation("common");

  return (
    <DialogContent className={DIALOG_CONTENT_CLASS}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
          <span className="text-nasun-white">{t("whitelist.modal.intro.title")}</span>
        </DialogTitle>
        <DialogDescription className="text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.intro.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-4">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-nasun-c1/20 text-nasun-c1 flex items-center justify-center font-medium">
              1
            </span>
            <div>
              <p className="text-nasun-c1 ">{t("whitelist.modal.intro.step1.title")}</p>
              <p className="text-nasun-white/70 text-xs/snug md:text-sm/snug xl:text-base/snug">
                {t("whitelist.modal.intro.step1.description")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-nasun-c1/20 text-nasun-c1 flex items-center justify-center font-medium">
              2
            </span>
            <div>
              <p className="text-nasun-c1 !normal-case">{t("whitelist.modal.intro.step2.title")}</p>
              <p className="text-nasun-white/70 text-xs/snug md:text-sm/snug xl:text-base/snug">
                {t("whitelist.modal.intro.step2.description")}
              </p>
            </div>
          </div>
        </div>

        <DividerBox color="c3" padding="sm" className="!p-3">
          <p className="flex items-start gap-2">
            <span className="text-xs/snug md:text-sm/snug xl:text-base/snug">ℹ️</span>
            <span className="text-xs/snug md:text-sm/snug xl:text-base/snug">
              {t("whitelist.modal.intro.notice")}
            </span>
          </p>
        </DividerBox>

        <p className="text-center text-nasun-white/70 text-xs/snug md:text-sm/snug xl:text-base/snug">
          {t("whitelist.modal.intro.noMetaMask")}{" "}
          <a
            href={METAMASK_INSTALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-nasun-c1 hover:text-nasun-c2 underline"
          >
            {t("whitelist.modal.intro.installLink")}
          </a>
        </p>
      </div>

      <DialogFooter className="flex-col sm:flex-row gap-3">
        <Button variant="outlineC1" size="md" onClick={onClose} className="w-full sm:w-auto">
          {t("whitelist.modal.intro.cancel")}
        </Button>
        <Button variant="c2" size="md" onClick={onProceed} className="w-full sm:w-auto opacity-80">
          <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5 mr-2" />
          {t("whitelist.modal.intro.proceed")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
