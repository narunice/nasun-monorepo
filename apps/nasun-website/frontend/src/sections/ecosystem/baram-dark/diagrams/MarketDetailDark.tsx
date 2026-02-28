import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { StaggerContainer, StaggerItem } from "../animations";
import { OuterBox } from "@/components/ui/OuterBox";

export function MarketDetailDark() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-6">
      <h5 className="font-semibold text-nasun-white">
        {t("gtm.headline")}
      </h5>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {(["beta", "sdk", "enterprise", "network"] as const).map((key, i) => (
          <StaggerItem key={key} className="h-full relative">
            <OuterBox color="noborder" padding="sm" className="h-full hover:shadow-md transition-all duration-200">
              <span className="text-nasun-br-1/50 font-mono text-xs uppercase tracking-wider block mb-3">
                {t(`gtm.stages.${key}.number`)}
              </span>
              <h6 className="font-semibold text-nasun-white mb-2">
                {t(`gtm.stages.${key}.title`)}
              </h6>
              <p className="text-nasun-white/70">
                {t(`gtm.stages.${key}.detail`)}
              </p>
            </OuterBox>
            {i < 3 && (
              <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                <ArrowRight className="w-4 h-4 text-nasun-white/40" />
              </div>
            )}
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
