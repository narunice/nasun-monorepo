import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV3 } from "@/components/ui/button-v3";

export default function OneAccountSection() {
  return (
    <SectionLayout className="!pt-0 !max-w-6xl">
      <FadeInUp>
        <OuterBox color="pd0" padding="md" className="text-center">
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
          <ButtonV3
            variant="gradient"
            size="sm"
            className="mt-6 mx-auto gap-1.5"
            asChild
          >
            <a href="https://pado.finance/" target="_blank" rel="noopener noreferrer">
              Go to Pado
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 0 1 0-1.06l7.22-7.22H8.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V7.28l-7.22 7.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
              </svg>
            </a>
          </ButtonV3>
        </OuterBox>
      </FadeInUp>
    </SectionLayout>
  );
}
