import { SectionLayout } from "@/components/layout/SectionLayout";
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

      <div className="flex flex-col gap-8 md:gap-10 lg:gap-12 xl:gap-14">
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
          <SectionTitle as="h4" className="font-normal uppercase text-center">
            Node Types
          </SectionTitle>

          {/* Mobile: Card layout */}
          <div className="space-y-3 md:hidden">
            {nodeTypes.map((node) => (
              <div key={node.type} className="border border-nasun-nw4/30 rounded-sm p-4 bg-gray-950">
                <p className="font-semibold text-nasun-nw4 mb-1">{node.type}</p>
                <p className="text-nasun-white/70 text-sm mb-2">
                  <span className="font-medium">Powers:</span> {node.powers}
                </p>
                <p className="text-nasun-white/70 text-sm">
                  <span className="font-medium">Earn NSN:</span> {node.earn}
                </p>
              </div>
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block overflow-hidden rounded-sm border border-nasun-nw1/40">
            <table className="w-full border-collapse bg-gray-950">
              <thead>
                <tr className="border-b border-nasun-nw4/30 bg-[#212E57]/50">
                  <th className="text-left py-3 px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">Node Type</h6>
                  </th>
                  <th className="text-left py-3 px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">Powers</h6>
                  </th>
                  <th className="text-left py-3 px-6 uppercase tracking-wider">
                    <h6 className="font-semibold text-nasun-nw4">Earn NSN</h6>
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodeTypes.map((node) => (
                  <tr key={node.type} className="border-b border-nasun-nw4/15">
                    <td className="py-4 px-6 align-top">
                      <p className="font-semibold text-nasun-nw4">{node.type}</p>
                    </td>
                    <td className="py-4 px-6 align-top">
                      <p className="text-nasun-white/70">{node.powers}</p>
                    </td>
                    <td className="py-4 px-6 align-top">
                      <p className="text-nasun-white/70">{node.earn}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How It Works */}
        <section>
          <SectionTitle as="h4" className="uppercase text-center">
            How It Works
          </SectionTitle>

          {/* Flow Diagram */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 py-6">
            {/* Step 1: Stake */}
            <div className="flex flex-col items-center gap-3 text-center flex-1">
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/60 bg-nasun-nw2/20 flex items-center justify-center">
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
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/60 bg-nasun-nw2/20 flex items-center justify-center">
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
              <div className="w-16 h-16 rounded-full border-2 border-nasun-nw4/60 bg-nasun-nw2/20 flex items-center justify-center">
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
          <SectionTitle as="h4" className="uppercase text-center">
            Network Participants
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4 p-5 rounded-sm border border-nasun-nw3/40 bg-gray-900/70">
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
            <div className="flex items-start gap-4 p-5 rounded-sm border border-nasun-nw3/40 bg-gray-900/70">
              <div className="w-12 h-12 rounded-full border border-nasun-nw4/50 bg-nasun-nw2/20 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5 text-nasun-nw4" />
              </div>
              <div>
                <p className="font-medium text-nasun-white text-lg mb-1">Operators</p>
                <p className="text-nasun-white/70">Access global demand with no intermediaries.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default InfraOverviewContent;
