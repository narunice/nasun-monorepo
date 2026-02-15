import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TPSChart } from "./TPSChart";
import { EpochProgress } from "./EpochProgress";
import { useTPS, useEpochInfo } from "../../../../hooks/network/useNetworkData";
import { useTPSHistory as useTPSAccumulator } from "../../../../hooks/network/useTPSHistory";

export const NetworkActivity: React.FC = () => {
  const { data: tps } = useTPS();
  const { data: epochInfo } = useEpochInfo();

  // Accumulate TPS history
  const tpsHistory = useTPSAccumulator(tps ?? null);

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <SectionTitle as="h4" className="font-normal uppercase !mb-0">
              Network Activity
            </SectionTitle>
            <div className="flex items-center gap-2 text-[10px] text-nasun-c3/60 font-mono uppercase tracking-widest">
              <span className="w-1.5 h-1.5 bg-nasun-c3 rounded-full animate-pulse" />
              Live Monitoring
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TPSChart data={tpsHistory} />
            <EpochProgress epochInfo={epochInfo} />
          </div>
        </div>
      </div>
    </SectionLayout>
  );
};

export default NetworkActivity;
