import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";

export function MarketDetail() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-6">
      <h5 className="font-semibold">
        {t("gtm.headline")}
      </h5>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {(["beta", "sdk", "enterprise", "network"] as const).map((key, i) => (
          <StaggerItem key={key} className="h-full relative">
            <div className="h-full bg-white/60 border border-nasun-c4/15 hover:border-nasun-c4/30 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
              <span className="text-nasun-c4/40 font-mono text-[11px] uppercase tracking-wider block mb-3">
                {t(`gtm.stages.${key}.number`)}
              </span>
              <h6 className="font-semibold mb-2">
                {t(`gtm.stages.${key}.title`)}
              </h6>
              <p className="!text-sm">
                {t(`gtm.stages.${key}.detail`)}
              </p>
            </div>
            {i < 3 && (
              <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                <ArrowRight className="w-4 h-4 text-nasun-c4/20" />
              </div>
            )}
          </StaggerItem>
        ))}
      </StaggerContainer>

    </div>
  );
}
