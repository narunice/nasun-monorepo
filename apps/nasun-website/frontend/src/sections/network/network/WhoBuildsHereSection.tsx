import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";

const VERTICALS = [
  { vertical: "Creators / Streaming", reason: "Programmable royalties and micropayments" },
  { vertical: "Gaming / Virtual Worlds", reason: "Persistent objects and cross-game portability" },
  { vertical: "AI / Agents", reason: "Attributable compute and agent coordination" },
  { vertical: "Finance", reason: "Multi-party capital coordination" },
  {
    vertical: "Infrastructure",
    reason: "High-frequency state and embedded economic logic",
  },
] as const;

function WhoBuildsHereSection() {
  return (
    <SectionLayout className="!max-w-6xl">
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            Who Builds Here
          </SectionTitle>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-nasun-nw3/40">
              <thead>
                <tr className="border-b border-nasun-nw3/40 bg-nasun-nw3/10">
                  <th className="text-left py-3 px-4 md:px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">Vertical</h6>
                  </th>
                  <th className="text-left py-3 px-4 md:px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">Why Nasun</h6>
                  </th>
                </tr>
              </thead>
              <tbody>
                {VERTICALS.map((row) => (
                  <tr key={row.vertical} className="border-b border-nasun-nw3/15">
                    <td className="py-4 px-4 md:px-6 align-top">
                      <p className="font-semibold text-nasun-nw4">{row.vertical}</p>
                    </td>
                    <td className="py-4 px-4 md:px-6 align-top">
                      <p className="text-nasun-white/70">{row.reason}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(WhoBuildsHereSection);
