import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Coins, ChevronRight, Server, TrendingUp, User, Wrench } from "lucide-react";

const InfraOverviewContent = () => {
  const { t } = useTranslation("infra");

  const nodeTypes = [
    { type: t("nodeTypes.validators.type"), powers: t("nodeTypes.validators.powers"), earn: t("nodeTypes.validators.earn") },
    { type: t("nodeTypes.executors.type"), powers: t("nodeTypes.executors.powers"), earn: t("nodeTypes.executors.earn") },
    { type: t("nodeTypes.compute.type"), powers: t("nodeTypes.compute.powers"), earn: t("nodeTypes.compute.earn") },
    { type: t("nodeTypes.storage.type"), powers: t("nodeTypes.storage.powers"), earn: t("nodeTypes.storage.earn") },
    { type: t("nodeTypes.streamers.type"), powers: t("nodeTypes.streamers.powers"), earn: t("nodeTypes.streamers.earn") },
    { type: t("nodeTypes.gameServers.type"), powers: t("nodeTypes.gameServers.powers"), earn: t("nodeTypes.gameServers.earn") },
  ];

  return (
    <SectionLayout className="!max-w-6xl">
      {/* Page Title */}
      <PageTitle>Nasun Infrastructure</PageTitle>

      <div className="flex flex-col gap-8 md:gap-10 lg:gap-12 xl:gap-14">
        {/* Intro */}
        <section>
          <SectionTitle as="h4">{t("intro.subtitle")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("intro.line1")}</p>
            <p>
              {t("intro.line2_pre")}
              <strong className="text-nasun-white">
                {t("intro.line2_highlight")}
              </strong>
              {t("intro.line2_post")}
              <strong className="text-nasun-white">{t("intro.line2_chain")}</strong>.
            </p>
          </div>
        </section>

        {/* Node Types - Table */}
        <section>
          <SectionTitle as="h4" className="font-normal uppercase text-center">
            {t("nodeTypes.title")}
          </SectionTitle>

          {/* Mobile: Card layout */}
          <div className="space-y-3 md:hidden">
            {nodeTypes.map((node) => (
              <div key={node.type} className="border border-nasun-nw4/30 rounded-sm p-4 bg-gray-950">
                <p className="font-semibold text-nasun-nw4 mb-1">{node.type}</p>
                <p className="text-nasun-white/70 text-sm mb-2">
                  <span className="font-medium">{t("nodeTypes.headers.powers")}:</span> {node.powers}
                </p>
                <p className="text-nasun-white/70 text-sm">
                  <span className="font-medium">{t("nodeTypes.headers.earnNsn")}:</span> {node.earn}
                </p>
              </div>
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block overflow-hidden rounded-sm border border-nasun-nw1/40">
            <table className="w-full border-collapse bg-gray-950">
              <thead>
                <tr className="border-b border-nasun-nw4/30 bg-[#212E57]/50">
                  <th className="text-left py-3 px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">{t("nodeTypes.headers.nodeType")}</h6>
                  </th>
                  <th className="text-left py-3 px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">{t("nodeTypes.headers.powers")}</h6>
                  </th>
                  <th className="text-left py-3 px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">{t("nodeTypes.headers.earnNsn")}</h6>
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodeTypes.map((node) => (
                  <tr key={node.type} className="border-b border-nasun-nw4/15">
                    <td className="py-4 px-6 align-top">
                      <p className="font-semibold text-nasun-nw4">{node.type}</p>
                    </td>
                    <td className="py-4 px-6 align-top">
                      <p className="text-nasun-white/70">{node.powers}</p>
                    </td>
                    <td className="py-4 px-6 align-top">
                      <p className="text-nasun-white/70">{node.earn}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How It Works */}
        <section>
          <SectionTitle as="h4" className="uppercase text-center">
            {t("howItWorks.title")}
          </SectionTitle>

          {/* Flow Diagram */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 py-6">
            {/* Step 1: Stake */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/60 bg-nasun-nw2/20 flex items-center justify-center">
                <Coins className="w-7 h-7 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg">{t("howItWorks.step1")}</p>
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-6 h-6 text-nasun-nw4/60 shrink-0 hidden md:block" />
            <div className="w-px h-6 bg-nasun-nw4/30 md:hidden" />

            {/* Step 2: Deliver */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/60 bg-nasun-nw2/20 flex items-center justify-center">
                <Server className="w-7 h-7 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg">{t("howItWorks.step2")}</p>
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-6 h-6 text-nasun-nw4/60 shrink-0 hidden md:block" />
            <div className="w-px h-6 bg-nasun-nw4/30 md:hidden" />

            {/* Step 3: Earn */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/60 bg-nasun-nw2/20 flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg">{t("howItWorks.step3")}</p>
              </div>
            </div>
          </div>

          <p className="text-center mt-2">
            {t("howItWorks.conclusion")}
          </p>
        </section>

        {/* Network Participants */}
        <section>
          <SectionTitle as="h4" className="uppercase text-center">
            {t("participants.title")}
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4 p-5 rounded-sm border border-nasun-nw3/40 bg-gray-900/70">
              <div className="w-12 h-12 rounded-full border border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg mb-1">{t("participants.users")}</p>
                <p className="text-nasun-white/70">
                  {t("participants.usersDesc")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-5 rounded-sm border border-nasun-nw3/40 bg-gray-900/70">
              <div className="w-12 h-12 rounded-full border border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg mb-1">{t("participants.operators")}</p>
                <p className="text-nasun-white/70">{t("participants.operatorsDesc")}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default InfraOverviewContent;
