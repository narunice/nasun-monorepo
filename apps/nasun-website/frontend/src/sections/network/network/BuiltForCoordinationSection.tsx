import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";

const COORDINATION_ITEMS = [
  "Persistent, evolving assets across games, AI models, and IP",
  "Programmable ownership with royalties, splits, and treasuries",
  "High-frequency microtransactions",
  "Parallel execution without global bottlenecks",
] as const;

function BuiltForCoordinationSection() {
  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            Built For Coordination
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p>
              Nasun powers applications where creators, platforms, users, and autonomous agents
              coordinate at scale:
            </p>

            <ul className="space-y-2 list-disc pl-6 md:pl-8 marker:text-nasun-nw4">
              {COORDINATION_ITEMS.map((item) => (
                <li key={item}>
                  <p>{item}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default BuiltForCoordinationSection;
