import React from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import type { HistoryItem } from "../../../types/grants";

function AwardsListSection() {
  const { t } = useTranslation("grants");

  // grants.list 가 곧 HistoryItem[] 이므로
  const grantsList = t("grants.list", { returnObjects: true }) as HistoryItem[];

  return (
    <SectionLayout className="!max-w-6xl !pb-0">
      <PageTitle as="h2" align="center" className="mb-6 md:mb-8">
        {t("title")}
      </PageTitle>

      <div className="relative ">
        {/* Timeline Line */}
        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-nasun-white/60 -translate-x-1/2" />

        {grantsList.map((item, idx) => {
          // 다크 테마 로고 사용
          const logoList: string[] = item.logos.dark;

          return (
            <div
              key={idx}
              className={`
                  relative mb-8 md:mb-10
                  ${idx % 2 === 0 ? "md:pr-[50%]" : "md:pl-[50%]"}
                  ${idx === grantsList.length - 1 ? "pb-0" : ""}
                `}
            >
              {/* Timeline Dot */}
              <div className="absolute left-4 md:left-1/2 top-4 h-3 w-3 rounded-full bg-gray-300 -translate-x-1/2 z-10" />

              {/* Content Card - Slide Up */}
              <motion.div
                initial={{ y: 30 }}
                whileInView={{ y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                viewport={{ once: true, margin: "-50px" }}
                className="ml-14 md:ml-0 md:px-6"
              >
                <DividerBox color="nw3" className="">
                  {/* Date */}
                  <p className="text-sm font-medium text-nasun-white/60 mb-2">{item.date}</p>

                  {/* Event Name */}
                  <h5 className=" font-semibold text-nasun-white">{item.event_name}</h5>

                  {/* Prize & Amount */}
                  <p className=" text-nasun-nw1 font-medium">
                    {item.prize}
                    {item.amount && ` · ${item.amount}`}
                  </p>

                  {/* Project */}
                  <p className="text-sm pt-2">{item.project}</p>

                  {/* Hosts */}
                  <ul className="list-disc list-inside mt-1">
                    {item.host.map((h, i) => (
                      <li key={i} className="text-sm ">
                        {h}
                      </li>
                    ))}
                  </ul>

                  {/* Logos */}
                  <div className="flex flex-wrap justify-around gap-5 pt-4 px-2">
                    {logoList.map((logo) => (
                      <img
                        key={logo}
                        src={`/${logo}`}
                        alt={logo}
                        className="h-7 flex-shrink-0 opacity-80"
                      />
                    ))}
                  </div>
                </DividerBox>
              </motion.div>
            </div>
          );
        })}
      </div>
    </SectionLayout>
  );
}

export default React.memo(AwardsListSection);
