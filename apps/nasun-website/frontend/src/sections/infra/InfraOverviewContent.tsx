import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Coins, ChevronRight, Server, TrendingUp, User, Wrench } from "lucide-react";

const nodeTypes = [
  { type: "Validators", powers: "Consensus & finality", earn: "Staking rewards" },
  { type: "Executors", powers: "AI / LLM inference (TEE)", earn: "Usage fees" },
  { type: "Compute", powers: "Apps & APIs", earn: "Compute demand" },
  { type: "Storage", powers: "Files & data", earn: "Storage fees" },
  { type: "Streamers", powers: "Live & on-demand video", earn: "Viewership" },
  { type: "Game Servers", powers: "Multiplayer worlds", earn: "Player sessions" },
];

const InfraOverviewContent = () => {
  return (
    <SectionLayout className="!max-w-6xl">
      {/* Page Title */}
      <PageTitle>Nasun Infrastructure</PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Intro */}
        <section>
          <SectionTitle as="h4">Decentralized compute for the next generation of IP.</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>No AWS lock-in. No censorship. Transparent pricing and on-chain SLAs.</p>
            <p>
              Nasun&apos;s global node network powers{" "}
              <strong className="text-nasun-white">
                AI inference, game servers, and streaming
              </strong>
              , all coordinated by <strong className="text-nasun-white">Nasun L1</strong>.
            </p>
          </div>
        </section>

        {/* Node Types - Table */}
        <section>
          <SectionTitle as="h4">Node Types</SectionTitle>
          <DividerBox color="nw1" padding="sm" hideDivider>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-nasun-nw4/30">
                    <th className="pb-3 pr-4 text-nasun-nw4 font-medium text-sm uppercase tracking-wider">
                      Node Type
                    </th>
                    <th className="pb-3 pr-4 text-nasun-nw4 font-medium text-sm uppercase tracking-wider">
                      Powers
                    </th>
                    <th className="pb-3 text-nasun-nw4 font-medium text-sm uppercase tracking-wider">
                      Earn NSN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {nodeTypes.map((node) => (
                    <tr key={node.type} className="border-b border-nasun-white/5 last:border-0">
                      <td className="py-3 pr-4 font-medium text-nasun-white">{node.type}</td>
                      <td className="py-3 pr-4 text-nasun-white/80">{node.powers}</td>
                      <td className="py-3 text-nasun-white/80">{node.earn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DividerBox>
        </section>

        {/* How It Works */}
        <section>
          <SectionTitle as="h4">How It Works</SectionTitle>

          {/* Flow Diagram */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 py-6">
            {/* Step 1: Stake */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center">
                <Coins className="w-7 h-7 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg">Stake NSN</p>
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-6 h-6 text-nasun-nw4/60 shrink-0 hidden md:block" />
            <div className="w-px h-6 bg-nasun-nw4/30 md:hidden" />

            {/* Step 2: Deliver */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center">
                <Server className="w-7 h-7 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg">Deliver service</p>
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-6 h-6 text-nasun-nw4/60 shrink-0 hidden md:block" />
            <div className="w-px h-6 bg-nasun-nw4/30 md:hidden" />

            {/* Step 3: Earn */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg">Earn on usage</p>
              </div>
            </div>
          </div>

          <p className="text-center mt-2">
            On-chain proofs and automatic slashing enforce service quality and reliability.
          </p>
        </section>

        {/* Network Participants */}
        <section>
          <SectionTitle as="h4">Network Participants</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4 p-5 rounded-sm border border-nasun-nw4/30 bg-nasun-nw2/10">
              <div className="w-12 h-12 rounded-full border border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg mb-1">Users</p>
                <p className="text-nasun-white/70">
                  Pay NSN for reliable, censorship-resistant infrastructure.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-5 rounded-sm border border-nasun-nw4/30 bg-nasun-nw2/10">
              <div className="w-12 h-12 rounded-full border border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg mb-1">Operators</p>
                <p className="text-nasun-white/70">
                  Access global demand with no intermediaries.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default InfraOverviewContent;
