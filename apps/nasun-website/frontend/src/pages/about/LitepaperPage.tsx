import { Link } from "react-router-dom";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { ButtonV2 } from "@/components/ui/button-v2";

export default function LitepaperPage() {
  return (
    <PageLayout>
      <SectionLayout className="!max-w-5xl">
        <div className="flex flex-col items-center">
          <PageTitle as="h2" align="center">
            About Nasun
          </PageTitle>

          <div className="flex flex-col gap-6 text-nasun-white/80 text-base md:text-lg leading-relaxed tracking-wide">
            <p>
              Nasun is a Move-based Layer-1 blockchain built as infrastructure for finance, AI, and
              entertainment.
            </p>

            <p>
              Three live platforms power the ecosystem: Pado, a full-featured DeFi platform; Gen
              Sol, a cinematic sci-fi universe spanning games, animation, and film; and Baram,
              on-chain governance for AI agents.
            </p>

            <p>
              Nasun is a global network building from a strategic beachhead. South Korea offers more
              than 16 million crypto users, approximately $70 billion in held digital assets, and no
              Korean-native decentralized trading venue or compliant self-custody infrastructure, a
              gap that is large, specific, and unaddressed.
            </p>

            <p>
              Regulatory frameworks are actively opening: stablecoin legislation, RWA tokenization
              initiatives, a tripling of national AI investment, and mandatory compliance
              requirements under Korea&apos;s AI Basic Act, now in effect. Korea&apos;s cultural
              export machine, reaching across film, television, and gaming, also gives the Gen Sol
              IP universe direct access to global audiences from launch.
            </p>

            <p className="font-semibold text-nasun-white">
              The foundation is Korean. The ambition is global.
            </p>

            <p>
              Nasun&apos;s Layer-1 vertically integrates its platforms, aligning the full economic
              stack for protocol-level execution, unified fee capture, and shared network effects
              across the ecosystem.
            </p>

            <p className="font-semibold text-nasun-white">
              All core systems are live on devnet. We built first.
            </p>
          </div>

          <div className="mt-20 flex flex-col items-center gap-10">
            <p className="text-2xl font-semibold tracking-wide">Litepaper Coming Soon</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <ButtonV2 variant="nasun-network" size="md" asChild className="w-full !from-[#496c9c80] !to-[#a2c5d880] hover:!from-[#496c9c] hover:!to-[#a2c5d8] hover:shadow-lg transition-all duration-300">
                <Link to="/network/nsn">
                  Explore <span className="font-semibold ml-1">Nasun</span>
                </Link>
              </ButtonV2>
              <ButtonV2 variant="baram" size="md" asChild className="w-full !from-[#5e9e5c80] !to-[#a2d4a080] hover:!from-[#5e9e5c] hover:!to-[#a2d4a0] hover:shadow-lg transition-all duration-300">
                <Link to="/ecosystem/baram">
                  Explore <span className="font-semibold ml-1">Baram</span>
                </Link>
              </ButtonV2>
              <ButtonV2 variant="pado" size="md" asChild className="w-full !from-[#1a8cbc80] !to-[#5ee1e480] hover:!from-[#1a8cbc] hover:!to-[#5ee1e4] hover:shadow-lg transition-all duration-300">
                <Link to="/ecosystem/pado">
                  Explore <span className="font-semibold ml-1">Pado</span>
                </Link>
              </ButtonV2>
              <ButtonV2 variant="sf-orange" size="md" asChild className="w-full !from-[#f0534080] !to-[#f5826e80] hover:!from-[#f05340] hover:!to-[#f5826e] hover:shadow-lg transition-all duration-300">
                <Link to="/ip/gensol">
                  Explore <span className="font-semibold ml-1">Gen Sol</span>
                </Link>
              </ButtonV2>
            </div>
          </div>
        </div>
      </SectionLayout>
    </PageLayout>
  );
}
