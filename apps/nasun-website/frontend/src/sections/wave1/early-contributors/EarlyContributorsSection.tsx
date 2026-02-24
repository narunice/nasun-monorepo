import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Mail, ArrowUpRight } from "lucide-react";

const lookingForItems = [
  "Content creators (X, YouTube, other platforms)",
  "Developers and technical contributors",
  "Artists and designers",
  "Community leads",
];

const whatYouGetItems = [
  { head: "A rare Battalion NFT", rest: " with utilities and airdrop multipliers" },
  { head: "Direct access", rest: " to the core team" },
  { head: "Allowlist", rest: " for the Battalion drop" },
  { head: "A share", rest: " of the launch marketing budget" },
];

function EarlyContributorsSection() {
  return (
    <SectionLayout className="!max-w-5xl">
      <PageTitle>EARLY CONTRIBUTORS</PageTitle>

      {/* Intro */}
      <div className="mb-8 md:mb-10 lg:mb-12 max-w-3xl mx-auto">
        <p className="mb-4">
          We're looking for early contributors to help build Nasun from the ground up.
        </p>
        <p>
          If you're a creator, developer, artist, or community leader who wants to help shape
          Nasun from Day 1, we'd love to hear from you.
        </p>
      </div>

      <div className="flex flex-col gap-8 md:gap-10">
        {/* What we're looking for */}
        <section>
          <SectionTitle as="h4">What we're looking for:</SectionTitle>
          <OuterBox color="nw0" padding="sm">
            <ul className="space-y-2">
              {lookingForItems.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </OuterBox>
        </section>

        {/* What you get */}
        <section>
          <SectionTitle as="h4">What you get:</SectionTitle>
          <OuterBox color="nw0" padding="sm">
            <ul className="space-y-2">
              {whatYouGetItems.map(({ head, rest }) => (
                <li key={head} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                  <span>
                    <span className="font-semibold text-nasun-nw4">{head}</span>
                    {rest}
                  </span>
                </li>
              ))}
            </ul>
          </OuterBox>
        </section>

        {/* Closing */}
        <div className="max-w-3xl mx-auto space-y-4">
          <p>
            Nasun is community-funded, not VC-backed. We're building this with our people, not
            with a fund.
          </p>
          <p>
            Spots are limited. If you're interested, email us or DM @Nasun_io.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <ButtonV3 variant="nw1" size="md" asChild>
            <a href="mailto:admin@nasun.io" className="inline-flex items-center gap-2">
              <Mail size={16} />
              Email Us
            </a>
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" asChild>
            <a
              href="https://x.com/Nasun_io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              DM @Nasun_io
              <ArrowUpRight size={16} />
            </a>
          </ButtonV3>
        </div>
      </div>
    </SectionLayout>
  );
}

export { EarlyContributorsSection };
export default React.memo(EarlyContributorsSection);
