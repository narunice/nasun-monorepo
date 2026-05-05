import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";

const VERTICAL_KEYS = ["v1", "v2", "v3", "v4", "v5"] as const;

function WhoBuildsHereSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
        <div className="max-w-5xl w-full mx-auto">
          <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
            <SectionTitle as="h4" className="font-normal uppercase">
              {t("whoBuildsHere.heading")}
            </SectionTitle>

            {/* Mobile: Card layout */}
            <div className="space-y-3 md:hidden">
              {VERTICAL_KEYS.map((key) => (
                <div key={key} className="border border-nasun-nw4/30 rounded-sm p-4 bg-gray-950">
                  <p className="font-semibold text-nasun-nw4 mb-1">
                    {t(`whoBuildsHere.${key}Name`)}
                  </p>
                  <p className="text-nasun-white/70">{t(`whoBuildsHere.${key}Reason`)}</p>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block overflow-hidden rounded-sm border border-nasun-nw1/40">
              <table className="w-full border-collapse bg-gray-950">
                <thead>
                  <tr className="border-b border-nasun-nw4/30 bg-[#212E57]/50">
                    <th className="text-left py-3 px-6 uppercase tracking-wider">
                      <h6 className="font-semibold text-nasun-nw4">
                        {t("whoBuildsHere.columnVertical")}
                      </h6>
                    </th>
                    <th className="text-left py-3 px-6 uppercase tracking-wider">
                      <h6 className="font-semibold text-nasun-nw4">
                        {t("whoBuildsHere.columnWhy")}
                      </h6>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {VERTICAL_KEYS.map((key) => (
                    <tr key={key} className="border-b border-nasun-nw4/15">
                      <td className="py-4 px-6 align-top">
                        <p className="font-semibold text-nasun-nw4">
                          {t(`whoBuildsHere.${key}Name`)}
                        </p>
                      </td>
                      <td className="py-4 px-6 align-top">
                        <p className="text-nasun-white/70">{t(`whoBuildsHere.${key}Reason`)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default WhoBuildsHereSection;
