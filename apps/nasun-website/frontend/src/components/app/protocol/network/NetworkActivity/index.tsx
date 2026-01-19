import React from "react";
import { TPSChart } from "./TPSChart";
import { EpochProgress } from "./EpochProgress";
import { useTPS, useEpochInfo } from "../../../../../hooks/network/useNetworkData";
import { useTPSHistory as useTPSAccumulator } from "../../../../../hooks/network/useTPSHistory";

export const NetworkActivity: React.FC = () => {
  const { data: tps, isFetching: tpsFetching } = useTPS();
  const { data: epochInfo, isFetching: epochFetching } = useEpochInfo();

  // Accumulate TPS history
  const tpsHistory = useTPSAccumulator(tps ?? null);

  const isUpdating = tpsFetching || epochFetching;

  return (
    <div className="w-full mt-12 md:mt-16 lg:mt-20">
      <div className="flex items-center justify-between mb-6 px-2">
        <h5 className="uppercase font-semibold">Network Activity</h5>
        {isUpdating && (
          <div className="flex items-center gap-2 text-[10px] text-nasun-c3/60 font-mono uppercase tracking-widest">
            <span className="w-1.5 h-1.5 bg-nasun-c3 rounded-full animate-pulse" />
            Live Monitoring
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TPSChart data={tpsHistory} />
        <EpochProgress epochInfo={epochInfo} />
      </div>

      <div className="mt-4 text-center">
        <p className="text-[12px] text-nasun-white/40 uppercase tracking-[0.2em]">
          Real-time data synced with Nasun Devnet
        </p>
      </div>
    </div>
  );
};

export default NetworkActivity;
