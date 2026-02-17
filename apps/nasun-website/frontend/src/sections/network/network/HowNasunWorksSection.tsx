import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

const REVENUE_ITEMS = [
  "Product development and sustainability",
  "Ecosystem growth programs",
  "Governance-approved network initiatives",
] as const;

function HowNasunWorksSection() {
  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            How Nasun Works
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p>
              Applications built on Nasun generate revenue that flows to projects and ecosystem
              treasury. NSN token holders govern how treasury funds are allocated.
            </p>

            <DividerBox color="nw4" title="Revenue supports" padding="sm" disableHover>
              <ul className="space-y-2 list-disc pl-5 marker:text-nasun-nw4">
                {REVENUE_ITEMS.map((item) => (
                  <li key={item}>
                    <p>{item}</p>
                  </li>
                ))}
              </ul>
            </DividerBox>

            <p className="font-medium text-nasun-white">
              Token holders govern. They do not receive revenue distributions.
            </p>

            <p>This aligns product success with long-term network health.</p>
          </div>
        </div>
      </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default HowNasunWorksSection;
