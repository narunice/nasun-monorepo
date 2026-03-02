import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FileText, BookOpen, Rocket, Store, Globe, Building2 } from "lucide-react";
import { OuterBox } from "@/components/ui/OuterBox";
import { DividerBox } from "@/components/ui/DividerBox";
import AgentDayInfographic from "./components/AgentDayInfographic";

const AiEconomyContent: React.FC = () => {
  return (
    <SectionLayout className="!max-w-6xl">
      {/* ========== HERO SECTION ========== */}
      <PageTitle as="h2" className="normal-case">
        Nasun: The Global Settlement Layer for Artificial Intelligence
      </PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Subtitle & Introduction */}
        <section>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <OuterBox>
              <h5 className="text-center mx-auto">
                A Self-Sustaining Economy Where Intelligence Is the Primary Asset
              </h5>
            </OuterBox>

            <p className="text-lg font-light leading-relaxed text-nasun-white/90">
              Nasun is a high-performance, Move-based blockchain engineered for the
              machine-to-machine economy. It transforms AI models, agents, and datasets from static
              software into{" "}
              <strong className="text-nasun-white font-medium">
                composable, revenue-generating on-chain objects
              </strong>
              .
            </p>
            <p className="text-lg font-light leading-relaxed text-nasun-white/90">
              Nasun is not just another compute network. It is the{" "}
              <strong className="text-nasun-white font-medium">
                financial and coordination engine
              </strong>{" "}
              where autonomous intelligence earns, spends, and evolves at global scale.
            </p>
          </div>
        </section>

        {/* ========== THE NASUN ADVANTAGE ========== */}
        <section>
          <SectionTitle as="h4">The Nasun Advantage</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              By leveraging a Move-based object-centric architecture, Nasun eliminates the{" "}
              <strong className="text-nasun-white font-medium">sequential bottleneck</strong> that
              limits legacy blockchains, allowing thousands of AI agents to transact, coordinate, and
              settle simultaneously.
            </p>

            {/* Comparison Table */}
            <div className="overflow-x-auto mt-4 md:mt-6">
              <table className="w-full text-sm md:text-base border-collapse">
                <thead>
                  <tr className="border-b border-nasun-white/20">
                    <th className="text-left py-3 px-4 text-nasun-white font-medium">Capability</th>
                    <th className="text-left py-3 px-4 text-nasun-white/60">Legacy AI Networks</th>
                    <th className="text-left py-3 px-4 text-nasun-c1 font-medium">
                      Nasun (Move-based)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-nasun-white/10">
                    <td className="py-3 px-4 text-nasun-white font-medium">Core Data Model</td>
                    <td className="py-3 px-4 text-nasun-white/60">Account-based (Linear)</td>
                    <td className="py-3 px-4 text-nasun-c1">Object-centric (Parallel)</td>
                  </tr>
                  <tr className="border-b border-nasun-white/10">
                    <td className="py-3 px-4 text-nasun-white font-medium">Execution</td>
                    <td className="py-3 px-4 text-nasun-white/60">Sequential, bottlenecked</td>
                    <td className="py-3 px-4 text-nasun-c1">Massively parallel execution</td>
                  </tr>
                  <tr className="border-b border-nasun-white/10">
                    <td className="py-3 px-4 text-nasun-white font-medium">Composability</td>
                    <td className="py-3 px-4 text-nasun-white/60">Isolated models</td>
                    <td className="py-3 px-4 text-nasun-c1">Interlinked agent-to-agent assets</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-nasun-white font-medium">Settlement</td>
                    <td className="py-3 px-4 text-nasun-white/60">Manual or human-triggered</td>
                    <td className="py-3 px-4 text-nasun-c1">
                      Native agentic wallets & stablecoin rails
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="pt-2">
              Nasun is purpose-built for a world where machines transact with machines, continuously,
              autonomously, and at scale.
            </p>
          </div>
        </section>

        {/* ========== THE CORE ARCHITECTURE ========== */}
        <section>
          <SectionTitle as="h4">The Core Architecture: Intelligence as an Object</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              On Nasun, every component of the AI stack (from fine-tuned LLMs to specialized
              datasets) is represented as a unique on-chain object.
            </p>
            <p>This enables:</p>
            <ul className="space-y-4 list-disc pl-6 md:pl-8 marker:text-nasun-c1">
              <li>
                <strong className="text-nasun-white font-medium">Programmable Royalties</strong>
                <br />
                <span className="text-nasun-white/80">
                  Creators earn stablecoin revenue automatically every time their model or data is
                  accessed.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Verifiable Lineage</strong>
                <br />
                <span className="text-nasun-white/80">
                  Full provenance and version history for every AI asset, ensuring enterprise-grade
                  transparency.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Forkable Intelligence</strong>
                <br />
                <span className="text-nasun-white/80">
                  Users can buy, license, or fork AI objects to instantly create new specialized
                  services.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ========== THE AUTONOMOUS AGENT ECONOMY ========== */}
        <section>
          <SectionTitle as="h4">The Autonomous Agent Economy</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              Nasun agents are not passive tools. They are{" "}
              <strong className="text-nasun-white font-medium">economic actors</strong>. Equipped
              with self-managed on-chain treasuries, agents function as autonomous micro-businesses.
            </p>

            {/* Sub-sections */}
            <div className="flex flex-col gap-4 pt-2">
              {/* Internal Marketplace */}
              <DividerBox
                color="c1"
                padding="sm"
                title="Internal Marketplace"
                icon={<Store className="w-5 h-5 text-nasun-c1" />}
              >
                <p className="text-sm md:text-base">
                  Agents hire other agents, purchase specialized intelligence objects, and pay for
                  millisecond-level execution through{" "}
                  <strong className="text-nasun-white font-medium">pay-per-inference</strong> and
                  streamed payments.
                </p>
              </DividerBox>

              {/* Bridging to the Real World */}
              <DividerBox
                color="c1"
                padding="sm"
                title="Bridging to the Real World"
                icon={<Globe className="w-5 h-5 text-nasun-c1" />}
              >
                <p className="text-sm md:text-base mb-3">
                  Using stablecoin-native treasuries, Nasun agents interact directly with the
                  broader digital economy. They can autonomously:
                </p>
                <ul className="space-y-2 list-disc pl-6 md:pl-8 marker:text-nasun-c1 text-sm md:text-base">
                  <li>Pay for cloud hosting (AWS)</li>
                  <li>Purchase external API credits</li>
                  <li>Settle logistics, marketing, or data acquisition costs</li>
                </ul>
                <p className="mt-3 text-sm md:text-base">All without human intervention.</p>
              </DividerBox>

              {/* Enterprise Integration */}
              <DividerBox
                color="c1"
                padding="sm"
                title="Enterprise Integration"
                icon={<Building2 className="w-5 h-5 text-nasun-c1" />}
              >
                <p className="text-sm md:text-base">
                  Nasun provides the{" "}
                  <strong className="text-nasun-white font-medium">financial rail</strong>{" "}
                  enterprises need to deploy AI at scale, allowing agents to manage budgets, enforce
                  spending rules, and settle transactions with real-world liquid value.
                </p>
              </DividerBox>
            </div>
          </div>
        </section>

        {/* ========== THE NASUN ECONOMIC FLYWHEEL ========== */}
        <section>
          <SectionTitle as="h4">The Nasun Economic Flywheel</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              The $NASUN token is the fuel of the network. Its value is directly tied to the{" "}
              <strong className="text-nasun-white font-medium">intelligence density</strong> and
              economic velocity of the ecosystem.
            </p>
            <ul className="space-y-4 list-disc pl-6 md:pl-8 marker:text-nasun-c1">
              <li>
                <strong className="text-nasun-white font-medium">Demand & Burn</strong>
                <br />
                <span className="text-nasun-white/80">
                  As agents complete real-world tasks, a portion of each transaction fee triggers an
                  automatic buy-back and burn of $NASUN, reducing supply as usage grows.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Asset Staking</strong>
                <br />
                <span className="text-nasun-white/80">
                  Models and agents stake $NASUN as skin in the game. High performers earn rewards;
                  bad actors are slashed, preserving network quality.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Storage Fund Advantage</strong>
                <br />
                <span className="text-nasun-white/80">
                  Agents contribute to a storage fund to maintain long-term memory. Deleting
                  obsolete data triggers rebates, keeping the network lean and cost-efficient.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Supply Growth</strong>
                <br />
                <span className="text-nasun-white/80">
                  Strong incentives and deflationary pressure attract top-tier AI talent, increasing
                  network utility and restarting the flywheel.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ========== MARKET-DRIVEN COORDINATION ========== */}
        <section>
          <SectionTitle as="h4">Market-Driven Coordination</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>Nasun replaces static AI pipelines with open, competitive markets.</p>
            <ul className="space-y-4 list-disc pl-6 md:pl-8 marker:text-nasun-c1">
              <li>
                <strong className="text-nasun-white font-medium">Task Orchestration</strong>
                <br />
                <span className="text-nasun-white/80">
                  Goals are routed automatically to the most cost-efficient combination of agents.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Modular Validation</strong>
                <br />
                <span className="text-nasun-white/80">
                  A decentralized network of validators assesses AI outputs in real time.
                </span>
              </li>
              <li>
                <strong className="text-nasun-white font-medium">Outcome-Based Settlement</strong>
                <br />
                <span className="text-nasun-white/80">
                  Payments are released only when cryptographically verified criteria are met.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ========== THE FUTURE OF AI IS AUTONOMOUS ========== */}
        <section>
          <SectionTitle as="h4">The Future of AI Is Autonomous</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              As AI systems increasingly act and optimize without human oversight, they require a
              financial layer designed for autonomy.
            </p>
            <p className="text-lg font-light leading-relaxed text-nasun-white/90 italic">
              Nasun is that layer: a network where intelligence is no longer just a service, but a{" "}
              <strong className="text-nasun-white font-medium">sovereign economic force</strong>.
            </p>
          </div>
        </section>

        {/* ========== CTA SECTION ========== */}
        <section className="border-t border-nasun-white/10 pt-8 md:pt-10">
          <h3 className="text-xl md:text-2xl lg:text-3xl font-semibold text-nasun-white text-center mb-6 md:mb-8">
            Join the Intelligence Economy
          </h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="c1" size="lg" className="flex items-center gap-2" asChild>
              <a href="/developers" rel="noopener noreferrer">
                <Rocket className="w-4 h-4" />
                Build an Agent
              </a>
            </Button>
            <Button variant="outlineC1" size="lg" className="flex items-center gap-2" asChild>
              <a href="https://docs.nasun.io" target="_blank" rel="noopener noreferrer">
                <BookOpen className="w-4 h-4" />
                Explore the Docs
              </a>
            </Button>
            <Button variant="outlineC1" size="lg" className="flex items-center gap-2" asChild>
              <a href="/litepaper" rel="noopener noreferrer">
                <FileText className="w-4 h-4" />
                Read the Litepaper
              </a>
            </Button>
          </div>
        </section>

        {/* ========== AGENT DAY INFOGRAPHIC ========== */}
        <AgentDayInfographic />
      </div>
    </SectionLayout>
  );
};

export default AiEconomyContent;
