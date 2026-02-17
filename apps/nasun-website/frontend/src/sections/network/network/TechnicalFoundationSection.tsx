import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";

const FOUNDATIONS = [
  {
    title: "Move",
    description: "Asset safety, explicit ownership, multi-party primitives.",
  },
  {
    title: "Mysticeti + DPoS",
    description: "Sub-second finality, scalable, energy-efficient consensus.",
  },
  {
    title: "Object-Centric Execution",
    description: "Parallel execution with no global contention.",
  },
] as const;

function TechnicalFoundationSection() {
  return (
    <SectionLayout maxWidth="6xl">
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            Technical Foundation
          </SectionTitle>

          <div className="space-y-6 md:space-y-8">
            {FOUNDATIONS.map((item) => (
              <div key={item.title} className="border-t border-nasun-white/10 pt-4 md:pt-5">
                <p className="font-semibold text-nasun-white">{item.title}</p>
                <p className="text-nasun-white/70 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default TechnicalFoundationSection;
