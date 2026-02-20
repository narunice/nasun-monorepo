import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { MessageSquare, FileText, Vote, Zap, Check, ArrowRight, ArrowDown } from "lucide-react";

const frameworkSteps = [
  {
    Icon: MessageSquare,
    step: "Collaborate",
    description: "Open creative iteration where anyone can contribute ideas or improvements.",
  },
  {
    Icon: FileText,
    step: "Propose",
    description:
      "Refined ideas are formalized with clear scope, contributors, and resource requirements.",
  },
  {
    Icon: Vote,
    step: "Vote",
    description: "The community decides what gets built and funded.",
  },
  {
    Icon: Zap,
    step: "Execute",
    description:
      "Approved proposals are executed with transparent treasury flows and contributor attribution recorded on-chain.",
  },
];

const networkProvides = [
  "Transparent treasury flows",
  "Composable digital assets",
  "Verifiable governance",
];

const creatorUnderstanding = ["Professional creative pipelines", "Technical systems engineering"];

const koreaAdvantages = [
  "Proven global cultural exports (Hallyu)",
  "High crypto adoption",
  "Advanced gaming ecosystem",
  "Production efficiency",
];

const StrategyOverviewV2 = () => {
  return (
    <SectionLayout className="!max-w-5xl">
      {/* Title */}
      <PageTitle>NASUN STRATEGY</PageTitle>
      <div className="text-center -mt-2 mb-10 md:mb-14">
        <p className="text-nasun-white/60">A System for Shared Creation</p>
      </div>

      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* 1. The Core Problem */}
        <section>
          <SectionTitle as="h4">
            <span>1.</span> The Core Problem
          </SectionTitle>
          <h5 className="mb-4 md:mb-5">Creation Has Exploded. Value Has Not.</h5>
          <div className="space-y-3">
            <p>AI tools and social platforms allow millions to create instantly.</p>
            <p>But:</p>
            <div className="border-l-4 border-nasun-nw1/40 pl-6 md:pl-8 py-2 space-y-2">
              <p>Stories launch then vanish.</p>
              <p>Content spreads and disappears.</p>
              <p>Platforms extract while creators get scraps.</p>
            </div>
            <p>
              The issue is not creativity.
              <br /> It is continuity.
            </p>
            <p>Without continuity, there is no compounding value.</p>
            <p>
              Communities need a way to build intellectual property together and share in its
              long-term success.
            </p>
          </div>
        </section>

        {/* 2. The Nasun Framework */}
        <section>
          <SectionTitle as="h4">
            <span>2.</span> The Nasun Framework
          </SectionTitle>
          <p className="mb-5 md:mb-6">
            Nasun treats on-chain execution as the final step, not the starting point.
          </p>

          {/* Flow: horizontal on desktop, vertical on mobile */}
          <div className="flex flex-col md:flex-row items-stretch">
            {frameworkSteps.map(({ Icon, step, description }, index) => (
              <React.Fragment key={step}>
                <OuterBox color="nw0" padding="sm" className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-nasun-nw1 flex-shrink-0" />
                    <h6 className="font-bold">{step}</h6>
                  </div>
                  <p className="text-nasun-white/75">{description}</p>
                </OuterBox>

                {index < frameworkSteps.length - 1 && (
                  <>
                    <div className="hidden md:flex items-center justify-center px-2 text-nasun-nw4/40 flex-shrink-0">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    <div className="flex md:hidden justify-center py-2 text-nasun-nw4/40">
                      <ArrowDown className="w-4 h-4" />
                    </div>
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* 3. The Network as Economic Backbone */}
        <section>
          <SectionTitle as="h4">
            <span>3.</span> The Network as Economic Backbone
          </SectionTitle>
          <p className="mb-5">Shared IP requires enforceable ownership.</p>
          <OuterBox color="nw1" padding="sm">
            <p className="mb-3">The Nasun Network provides:</p>
            <ul className="space-y-2">
              {networkProvides.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-nasun-nw4 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </OuterBox>
          <p className="mt-4">
            When an IP generates revenue, through a game, film, AI platform, or financial
            application, net revenue flows back to the projects and treasury.
          </p>
        </section>

        {/* 4. Built by Creators, Not Just Engineers */}
        <section>
          <SectionTitle as="h4">
            <span>4.</span> Built by Creators, Not Just Engineers
          </SectionTitle>
          <p className="mb-5">Nasun began in production, not speculation.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <OuterBox color="nw0" padding="sm">
              <h6 className="font-bold text-nasun-nw4 mb-2">Naru</h6>
              <p className="text-nasun-white/80">
                Head editor and producer on Korean films premiering at Cannes, Berlin, and Venice.
              </p>
            </OuterBox>
            <OuterBox color="nw0" padding="sm">
              <h6 className="font-bold text-nasun-nw4 mb-2">Overclocked</h6>
              <p className="text-nasun-white/80">
                20+ years in media production. Built Gen Sol multiplayer alpha in UE5 (C++).
              </p>
            </OuterBox>
          </div>
          <p className="mb-3">We understand both:</p>
          <ul className="space-y-2 mb-4">
            {creatorUnderstanding.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>Nasun exists because existing platforms failed to coordinate both.</p>
        </section>

        {/* 5. Why Korea, Why Global */}
        <section>
          <SectionTitle as="h4">
            <span>5.</span> Why Korea, Why Global
          </SectionTitle>
          <p className="mb-4">Korea is the launchpad:</p>
          <ul className="space-y-2 mb-5">
            {koreaAdvantages.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="font-medium text-nasun-white">Global from day one.</p>
        </section>

        {/* 6. Why Now: The Relevance Era */}
        <section>
          <SectionTitle as="h4">
            <span>6.</span> Why Now: The Relevance Era
          </SectionTitle>
          <div className="space-y-3">
            <p>AI is flooding the world with content.</p>
            <p>Crypto has onboarded millions, but relevance remains shallow.</p>
            <p>The next era will not be defined by speculation or infinite content.</p>
            <p>It will be defined by systems that allow communities to:</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 my-6 md:my-8">
            <h5 className="font-medium">Create together</h5>
            <span className="hidden sm:block text-nasun-nw4/30">|</span>
            <h5 className="font-medium">Decide together</h5>
            <span className="hidden sm:block text-nasun-nw4/30">|</span>
            <h5 className="font-medium">Own together</h5>
          </div>
          <p>
            Nasun is the infrastructure that makes this coordination technically possible and
            economically sustainable.
          </p>
        </section>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-4">
          <ButtonV3 variant="nw1" size="md" disabled>
            Litepaper
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" outline disabled>
            Join Beta
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" outline disabled>
            Team Deck
          </ButtonV3>
        </div>
      </div>
    </SectionLayout>
  );
};

export default StrategyOverviewV2;
