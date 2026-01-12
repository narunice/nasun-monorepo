import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

interface PositionData {
  title: string;
  skills: string;
  work: string[];
}

function HiresSection() {
  const { t } = useTranslation("spectra");

  const positionKeys = ["artist2d", "artist3d", "ueDesigner", "ueProgrammer"];

  const positions = positionKeys
    .map((key) => {
      const data = t(`hires.positions.${key}` as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
        returnObjects: true,
      }) as unknown as PositionData;

      if (!data || typeof data !== "object" || !Array.isArray(data.work)) {
        return null;
      }
      return { key, data };
    })
    .filter((p): p is { key: string; data: PositionData } => p !== null);

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("hires.title")}
        </SectionTitle>

        <div className="space-y-6 md:space-y-8">
          {positions.map(({ key, data }) => (
            <div key={key} className="flex gap-4">
              <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
              <div>
                <h4 className="text-lg font-semibold mb-2 md:mb-3">{data.title}</h4>

                <div className="space-y-3 md:space-y-4">
                  <div>
                    <h5 className="text-sm font-medium text-nasun-c1 mb-1">Skills</h5>
                    <p>{data.skills}</p>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-nasun-c1 mb-1">Work</h5>
                    <ul className="space-y-1">
                      {data.work.map((item, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-nasun-c1 mr-2">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(HiresSection);
