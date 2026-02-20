import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Orbit, Wind, Wallet, Layers, Server, Sparkles, Users } from "lucide-react";

const AboutOverviewContent = () => {
  return (
    <SectionLayout className="!max-w-5xl">
      {/* Hero */}
      <PageTitle>NASUN</PageTitle>
      <div className="text-center -mt-2 mb-8 md:mb-12">
        <p className="text-xl md:text-2xl font-medium text-nasun-white">Community-owned IP.</p>
        <p className="text-xl md:text-2xl font-medium text-nasun-white">
          Built on decentralized infrastructure.
        </p>
      </div>

      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* The Problem */}
        <section>
          <SectionTitle as="h4">The Problem</SectionTitle>
          <div className="border-l-4 border-nasun-nw1/50 pl-6 md:pl-8 py-2 space-y-4">
            <div>
              <p className="text-lg md:text-xl text-nasun-white/90">Platforms capture value.</p>
              <p className="text-lg md:text-xl text-nasun-nw4">Communities create it.</p>
            </div>
            <div>
              <p className="text-lg md:text-xl text-nasun-white/90">Creators compete.</p>
              <p className="text-lg md:text-xl text-nasun-white/90">Fans consume.</p>
              <p className="text-lg md:text-xl text-nasun-white/90">Platforms extract.</p>
            </div>
            <p className="text-lg md:text-xl font-medium text-nasun-white">
              IP should be built and owned together.
            </p>
          </div>
        </section>

        {/* The Flagships */}
        <section>
          <SectionTitle as="h4">The Flagships</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OuterBox color="nw0" padding="sm">
              <div className="flex items-center gap-3 mb-3">
                <Orbit className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                <h6 className="font-bold text-nasun-white">Gen Sol</h6>
              </div>
              <p className="text-nasun-white/80">
                A sci-fi universe powering games, films, and shows.
              </p>
            </OuterBox>
            <OuterBox color="nw0" padding="sm">
              <div className="flex items-center gap-3 mb-3">
                <Wind className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                <h6 className="font-bold text-nasun-white">Baram</h6>
              </div>
              <p className="text-nasun-white/80">The global settlement layer for AI.</p>
            </OuterBox>
            <OuterBox color="nw0" padding="sm">
              <div className="flex items-center gap-3 mb-3">
                <Wallet className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                <h6 className="font-bold text-nasun-white">Pado</h6>
              </div>
              <p className="text-nasun-white/80">Unified onchain financial platform.</p>
            </OuterBox>
          </div>
          <p className="mt-5 text-nasun-white/80 text-center">
            NASUN aligns creation, coordination, and capital in a single system.
          </p>
        </section>

        {/* Our Approach */}
        <section>
          <SectionTitle as="h4">Our Approach</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Layers className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  Ownership Layer
                </h6>
              </div>
              <p className="text-nasun-white/80">
                A Move-based L1 for coordination and asset ownership.
              </p>
            </OuterBox>
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Server className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  Infrastructure
                </h6>
              </div>
              <p className="text-nasun-white/80">
                Decentralized compute, AI, storage, and finance.
              </p>
            </OuterBox>
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  Flagship Projects
                </h6>
              </div>
              <p className="text-nasun-white/80">We build products to seed demand.</p>
            </OuterBox>
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  Community Governance
                </h6>
              </div>
              <p className="text-nasun-white/80">Contributors shape what gets built and funded.</p>
            </OuterBox>
          </div>
        </section>

        {/* Current Stage */}
        <section>
          <SectionTitle as="h4">Current Stage</SectionTitle>
          <OuterBox color="nw0" padding="sm" className="!bg-gray-900">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm md:text-base">
              <span>
                <span className="text-nasun-nw4 font-medium">Devnet:</span>{" "}
                <span className="text-nasun-white">Live</span>
              </span>
              <span className="text-nasun-white/30 hidden sm:inline">|</span>
              <span>
                <span className="text-nasun-nw4 font-medium">Nodes:</span>{" "}
                <span className="text-nasun-white">Testing</span>
              </span>
              <span className="text-nasun-white/30 hidden sm:inline">|</span>
              <span>
                <span className="text-nasun-nw4 font-medium">Apps:</span>{" "}
                <span className="text-nasun-white">In development</span>
              </span>
              <span className="text-nasun-white/30 hidden sm:inline">|</span>
              <span>
                <span className="text-nasun-nw4 font-medium">Governance:</span>{" "}
                <span className="text-nasun-white">Rolling out</span>
              </span>
            </div>
          </OuterBox>
        </section>

        {/* The Vision */}
        <section className="text-center py-4 md:py-8">
          <SectionTitle as="h4">The Vision</SectionTitle>
          <div className="space-y-1 mb-8">
            <p className="text-lg md:text-xl text-nasun-white">
              Communities build the next generation of global IP.
            </p>
            <p className="text-lg md:text-xl text-nasun-white/70">Not rented from platforms.</p>
            <p className="text-lg md:text-xl font-medium text-nasun-white">
              Owned by the people who build it.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <ButtonV3 variant="nw1" size="md" asChild>
              <Link to="/wave1/battalion-nft">Battalion NFT</Link>
            </ButtonV3>
            <ButtonV3 variant="nw1" size="md" outline disabled>
              Frontiers
            </ButtonV3>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default AboutOverviewContent;
