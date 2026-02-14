import React from "react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionLayout } from "@/components/layout/SectionLayout";

function GenesisNftHeroSection() {
  return (
    <SectionLayout className="">
      {/* Content Box - Semi-transparent container */}
      <div className="max-w-7xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto pt-28 pb-0 md:py-20 xl:py-24">
          <OuterBox color="c5" className="">
            {/* Main Title */}
            <SectionTitle
              as="h2"
              className="!font-rubik font-medium uppercase text-center mb-2 md:mb-3 lg:mb-4 xl:mb-5"
            >
              Frontiers Event
            </SectionTitle>

            {/* Subtitle with highlight */}
            <div className="mb-1 md:mb-2 lg:mb-3">
              <span className="!font-founders  text-nasun-white font-medium !text-xl/tight !md:text-2xl/tight !xl:text-3xl/tight tracking-wide">
                You — the early contributors, creators, and visionaries —
              </span>{" "}
              <span className="!font-founders text-nasun-white/85 font-medium !text-xl/tight !md:text-2xl/tight !xl:text-3xl/tight tracking-wide">
                form the heart of Nasun's community.
              </span>
            </div>

            <div className="mb-6 md:mb-7 lg:mb-8">
              {/* Description paragraphs */}
              <p className="text-nasun-white/85 text-sm md:text-base mb-1 md:mb-2 lg:mb-3">
                As one of the first to join our journey, you help shape the foundation on which
                Nasun's vision will grow.
              </p>
              <p className="text-nasun-white/85 text-sm md:text-base mb-1 md:mb-2 lg:mb-3">
                The Nasun Frontiers Event recognizes your early participation and grants exclusive
                access, privileges, and eligibility across the Nasun ecosystem.
              </p>{" "}
            </div>

            {/* Vision Section - DividerBox */}
            <DividerBox
              color="n1"
              title="Embody Our Vision and Commitment"
              className="font-semibold"
              titleClassName="text-nasun-c3
               "
            >
              <p className="text-nasun-white/85 mb-4 ">
                Each piece was inspired by the sci-fi world-building of our first IP—Gen Sol, and
                was crafted using tools like Blender, ZBrush, Substance Painter, and Photoshop.
              </p>
              <p className="text-nasun-white/85">
                Owning one means joining us beyond the boundaries of art, finance, and
                technology—where our imagination fuels our journey into a future without limits.
              </p>
            </DividerBox>
          </OuterBox>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GenesisNftHeroSection);
