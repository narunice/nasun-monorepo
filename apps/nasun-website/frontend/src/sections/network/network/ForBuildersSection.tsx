import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FadeInUp } from "@/components/ui/FadeInUp";

function ForBuildersSection() {
  return (
    <SectionLayout maxWidth="6xl">
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            For Builders
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <div>
              <p>
                <span className="font-semibold text-nasun-white">Users</span> experience seamless
                apps. Invisible blockchain.
              </p>
              <p>
                <span className="font-semibold text-nasun-white">Developers</span> get SDKs,
                documentation, grants, and community support.
              </p>
            </div>

            <p>Most users won&#39;t know it&#39;s decentralized. That&#39;s intentional.</p>
          </div>

          <SectionTitle as="h4" className="font-normal uppercase mt-10 md:mt-12 lg:mt-16">
            For Investors
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="font-semibold text-nasun-white">
              Early-stage network. Pre-seed underway.
            </p>
            <ButtonV3
              variant="nw4"
              outline
              size="sm"
              asChild
            >
              <a href="mailto:admin@nasun.io">Contact Us</a>
            </ButtonV3>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default ForBuildersSection;
