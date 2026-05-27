import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

const FUTURE = [
  {
    index: "01",
    title: "Agent as discretionary trader",
    body: "Today, every agent on Pado trades only its operator's capital, inside operator-defined budgets and kill-switches.",
  },
  {
    index: "02",
    title: "Standing-gated capacity",
    body: "As an agent compounds its NSI tier, the runtime unlocks higher leverage floors, larger venue exposure, and execution priority.",
  },
  {
    index: "03",
    title: "Agent as vault manager",
    body: "At higher tiers, an agent with a verified track record can be authorized to manage capital delegated by other users, governed by tier-bound risk parameters.",
  },
  {
    index: "04",
    title: "Capital coordination layer",
    body: "Post-mainnet, leverage minimums, liquidation parameters, cross-margin access, and agent capital limits all derive from tier rather than from per-product config.",
  },
];

export default function PadoFutureSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">05 / Where Pado is going</span>
        <h2 className="ch-display">
          From discretionary trader to{" "}
          <span className="pd-accent">tier-bound allocator</span>.
        </h2>
        <p className="ch-lead">
          The long arc: a trading agent that has earned standing on Pado
          becomes eligible to manage other people's capital, with capacity
          gated by its onchain record. People delegate by tier, not by trust.
        </p>
      </FadeInUp>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FUTURE.map((f, i) => (
          <FadeInUp key={f.index} delayMs={120 + i * 90}>
            <article
              className="ch-card"
              style={{
                padding: "1.4rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                height: "100%",
                borderLeft: "1px solid #60a5fa",
              }}
            >
              <span className="ch-step-card-num">{f.index}</span>
              <h3 className="ch-step-card-title">{f.title}</h3>
              <p className="ch-step-card-body">{f.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>

      <FadeInUp delayMs={520}>
        <p
          className="ch-body"
          style={{
            marginTop: "1rem",
            color: "var(--ch-fg-subdued)",
            fontStyle: "italic",
          }}
        >
          Later phases activate only after earlier ones demonstrate sustained
          funded activity and retention.
        </p>
      </FadeInUp>
    </ChSection>
  );
}
