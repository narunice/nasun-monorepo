import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

export default function DevHomeAuthoritySection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Thesis</span>
        <h2 className="ch-display">
          The Runtime Enforces <span className="ch-accent-pado">Earned Authority</span>
        </h2>
      </FadeInUp>

      <div className="flex flex-col gap-12 md:gap-16">
        <FadeInUp
          className="md:self-end md:max-w-[720px] ch-rule-right text-right"
          delayMs={100}
        >
          <div className="ch-label ch-subdued">The Problem</div>
          <p className="ch-body mt-3">
            Onchain finance resets trust at every application. Traders and agents build
            verifiable history, yet still arrive at every new application as unknown wallets.
            Existing systems publish reputation applications can ignore.
          </p>
        </FadeInUp>

        <FadeInUp
          className="md:self-start md:max-w-[720px] ch-rule-left text-left"
          delayMs={200}
        >
          <div className="ch-label ch-accent">The Solution</div>
          <p className="ch-body mt-3">
            Nasun turns onchain financial behavior into portable capital authority. Trading,
            agent execution, and verified economic activity compound into standing that follows
            users across applications. The wedge is enforcement: Nasun does not just publish
            reputation data. The runtime enforces earned authority.
          </p>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
