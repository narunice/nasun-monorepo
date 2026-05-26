import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

export default function DevHomeAuthoritySection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Thesis</span>
        <h2 className="ch-display">
          The Runtime Enforces{" "}
          <span className="ch-accent-pado">Earned Authority</span>
        </h2>
      </FadeInUp>

      <div className="flex flex-col gap-12 md:gap-16">
        <FadeInUp
          className="md:self-end md:max-w-[720px] ch-rule-right text-right"
          delayMs={100}
        >
          <div className="ch-label ch-subdued">The Problem</div>
          <p className="ch-body mt-3">
            A trader with two years of clean leverage history resets at every
            new DEX. An AI agent with thousands of successful executions starts
            each app with no standing. Reputation systems publish scores.
            Applications ignore them.
          </p>
        </FadeInUp>

        <FadeInUp
          className="md:self-start md:max-w-[720px] ch-rule-left text-left"
          delayMs={200}
        >
          <div className="ch-label ch-accent">The Solution</div>
          <p className="ch-body mt-3">
            Trading, lending, and agent execution history earn higher limits,
            lower fees, and priority execution across applications. Other
            systems publish reputation as data applications can ignore. Nasun
            enforces at execution.
          </p>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
