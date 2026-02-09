import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";

const modelItems = [
  { number: "1", title: "Protocol", description: "Move L1 for ownership/coordination" },
  { number: "2", title: "Infrastructure", description: "Decentralized AI/compute/games/storage" },
  { number: "3", title: "Studio", description: "Flagships (Gen Sol, Baram, Pado)" },
  { number: "4", title: "Community", description: "Contributors govern + earn" },
];

const whyWeWin = [
  { edge: "Vertical integration", how: "Seamless UX" },
  { edge: "Flagship apps", how: "Demand + proof" },
  { edge: "Open infra", how: "Dev ecosystem" },
  { edge: "Shared ownership", how: "Aligned incentives" },
];

const stageItems = ["Finish protocol", "Scale infra", "Launch flagships", "Grow devs/community"];

const AboutOverviewContent = () => {
  return (
    <SectionLayout className="!max-w-6xl">
      {/* Page Title */}
      <PageTitle>NASUN</PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Intro */}
        <section>
          <SectionTitle as="h4">Community-owned IP on decentralized infra.</SectionTitle>
          <p>
            Games. AI. Creator economies. Built with &mdash; not extracted from &mdash; communities.
          </p>
        </section>

        {/* The Thesis */}
        <section className="flex flex-col py-16">
          <SectionTitle as="h4" className="uppercase tracking-wider">
            The Thesis
          </SectionTitle>
          <div className="border-l-4 border-[#6697b7] pl-6 md:pl-8 py-2">
            <p className="text-2xl md:text-3xl font-medium bg-gradient-to-r from-[#999999] to-[#e0e0e0] bg-clip-text text-transparent">
              Platforms capture value.
            </p>
            <p className="text-2xl md:text-3xl font-medium bg-gradient-to-r from-[#6697b7] to-[#f5fbff] bg-clip-text text-transparent">
              Nasun shares it.
            </p>
          </div>
        </section>

        {/* Our Model */}
        <section>
          <SectionTitle as="h4">Our Model</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {modelItems.map((item) => (
              <DividerBox key={item.number} color="nw1" title={`${item.number}. ${item.title}`}>
                <p className="text-nasun-white/90 text-lg font-light">{item.description}</p>
              </DividerBox>
            ))}
          </div>
        </section>

        {/* Why We Win */}
        <section>
          <SectionTitle as="h4">Why We Win</SectionTitle>
          <DividerBox color="nw1" padding="sm" hideDivider>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-nasun-nw4/30">
                    <th className="pb-3 pr-4 text-nasun-nw4 font-medium text-sm uppercase tracking-wider">
                      Edge
                    </th>
                    <th className="pb-3 text-nasun-nw4 font-medium text-sm uppercase tracking-wider">
                      How
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {whyWeWin.map((item) => (
                    <tr key={item.edge} className="border-b border-nasun-white/5 last:border-0">
                      <td className="py-3 pr-4 font-medium text-nasun-white">{item.edge}</td>
                      <td className="py-3 text-nasun-white/80">{item.how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DividerBox>
          <p className="mt-4">
            <strong className="text-nasun-white">Vision:</strong> Communities own the next
            Disney/Netflix/Google.
          </p>
        </section>

        {/* Stage & Use of Funds */}
        <section>
          <SectionTitle as="h4">Stage & Use of Funds</SectionTitle>
          <DividerBox color="nw1" padding="sm">
            <p className="text-lg mb-4">
              <strong className="text-nasun-white">Now:</strong> Devnet live. Nodes testing soon.
              Apps building.
            </p>
            <ul className="space-y-3 text-nasun-white/90 text-lg font-light">
              {stageItems.map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-nasun-nw4 font-medium mt-0.5">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </DividerBox>
        </section>

        {/* CTA Buttons */}
        <section className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <ButtonV3 variant="gradientDark" size="md" asChild>
            <a href="mailto:admin@nasun.io">Pre-seed: Invest</a>
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" outline asChild>
            <a
              href={import.meta.env.VITE_DEVNET_EXPLORER_URL || "https://explorer.nasun.io/devnet"}
              target="_blank"
              rel="noopener noreferrer"
            >
              Devnet
            </a>
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" outline asChild>
            <a href="#" target="_blank" rel="noopener noreferrer">
              Discord
            </a>
          </ButtonV3>
        </section>
      </div>
    </SectionLayout>
  );
};

export default AboutOverviewContent;
