import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

export default function OneAccountSection() {
  return (
    <SectionLayout className="!pt-0 !max-w-6xl">
      <FadeInUp>
        <OuterBox color="pd0" padding="md" className="">
          <h3 className="!font-rubik text-center uppercase  font-medium text-2xl md:text-3xl lg:text-4xl mb-2 md:mb-4">
            One Account for Everything
          </h3>
          <p className="text-pd4 text-base md:text-lg leading-relaxed">
            Pado is a high-performance, self-custodial financial platform that unifies trading,
            lending, and contextual finance into a single onchain account. Built on Nasun, a
            Move-based Layer 1 optimized for parallel execution, Pado replaces the fragmented
            capital problem across protocols with one smart account governed by a unified risk
            engine. One balance that earns yield, backs trades, remains instantly usable across all
            products, and stays liquid.
          </p>
          {/* <Button
            variant="pado"
            size="lg"
            className="flex w-fit items-center gap-2 mt-6 mx-auto text-pd0"
            disabled
          >
            Try Pado Alpha
            <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button> */}
        </OuterBox>
      </FadeInUp>
    </SectionLayout>
  );
}
