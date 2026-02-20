import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Code2, Gamepad2, Film, Check, Zap } from "lucide-react";

const roles = [
  {
    Icon: Code2,
    title: "Lead Move Developer",
    description:
      "Architect core protocol logic and DeFi primitives powering Pado. Help scale the network toward high-performance execution.",
  },
  {
    Icon: Gamepad2,
    title: "UE5 Lead Engineer",
    description:
      "Lead Gen Sol SPECTRA development. Ship multiplayer systems from alpha to mainnet scale.",
  },
  {
    Icon: Film,
    title: "Film Business Lead",
    description:
      "Secure Hallyu grants and partnerships. Build Rider Studio's pipeline from development to distribution.",
  },
];

const benefits = [
  "Pre-seed equity allocation",
  "Genesis NFT allocation",
  "Direct influence over protocol, IP, and treasury direction",
  "Opportunity to shape a global IP + DeFi ecosystem from inception",
];

const advisorTargets = [
  "Korean government and film industry partners",
  "Gaming-focused VCs",
  "Major DeFi protocols",
];

function OpportunitiesSection() {
  return (
    <SectionLayout className="!max-w-5xl">
      {/* Hero */}
      <PageTitle>OPPORTUNITIES</PageTitle>
      <div className="text-center -mt-2 mb-10 md:mb-14">
        <h4 className="font-medium">Join the founding team.</h4>
        <h4 className="font-medium text-nasun-nw4">Culture + Capital + Korean execution.</h4>
        <p className="text-nasun-white/60 max-w-2xl mx-auto mt-4">
          Nasun is assembling a small, high-conviction founding group to build the next generation
          of community-owned IP.
        </p>
      </div>

      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* Founding Roles */}
        <section>
          <div className="flex flex-wrap items-baseline gap-3 mb-5">
            <SectionTitle as="h4" className="!mb-0">
              Founding Roles
            </SectionTitle>
            <span className="inline-block px-2.5 py-0.5 rounded-full border border-nasun-nw4/30 bg-nasun-nw4/10 text-nasun-nw4 text-xs uppercase tracking-widest font-medium">
              Equity + Genesis NFT Allocation
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map(({ Icon, title, description }) => (
              <OuterBox key={title} color="nw0" padding="sm">
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                  <h6 className="font-bold">{title}</h6>
                </div>
                <p className="text-nasun-white/75">{description}</p>
              </OuterBox>
            ))}
          </div>
        </section>

        {/* What Founders Receive */}
        <section>
          <SectionTitle as="h4">What Founders Receive</SectionTitle>
          <OuterBox color="nw1" padding="sm">
            <ul className="space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-nasun-nw4 mt-0.5 flex-shrink-0" />
                  <span className="text-nasun-white/90">{benefit}</span>
                </li>
              ))}
            </ul>
          </OuterBox>
        </section>

        {/* Strategic Advisors + Builders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strategic Advisors */}
          <section className="flex flex-col">
            <SectionTitle as="h4">Strategic Advisors</SectionTitle>
            <OuterBox color="nw0" padding="sm" className="flex-1">
              <p className="text-nasun-white/50 mb-4">
                We are in active conversations with:
              </p>
              <ul className="space-y-3">
                {advisorTargets.map((target) => (
                  <li key={target} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                    <span className="text-nasun-white/85">{target}</span>
                  </li>
                ))}
              </ul>
            </OuterBox>
          </section>

          {/* Builders */}
          <section className="flex flex-col">
            <SectionTitle as="h4">Builders</SectionTitle>
            <OuterBox color="nw0" padding="sm" className="flex-1">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-nasun-nw4 mt-0.5 flex-shrink-0" />
                <p className="text-nasun-white/85">
                  Devnet grants available for culture-first dApps built on Nasun.
                </p>
              </div>
            </OuterBox>
          </section>
        </div>

        {/* CTA */}
        <div className="text-center pb-4">
          <ButtonV3 variant="nw1" size="md" asChild>
            <a href="mailto:admin@nasun.io">Contact Us</a>
          </ButtonV3>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(OpportunitiesSection);
