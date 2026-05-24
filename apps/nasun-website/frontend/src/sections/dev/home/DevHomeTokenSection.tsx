import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

const SINKS: Array<{ title: string; body: string }> = [
  {
    title: "Staking",
    body: "Required for executor and validator participation in the network.",
  },
  {
    title: "Gas",
    body: "All runtime transactions settle in NSN.",
  },
  {
    title: "Agent Execution",
    body: "Every agent execution receipt settles through NSN.",
  },
  {
    title: "Emissions Weighting",
    body: "Tier-weighted distribution favors users and agents with earned standing.",
  },
  {
    title: "Fee Routing",
    body: "Fees from Pado, lending, prediction, and agent execution route through the token economy.",
  },
];

export default function DevHomeTokenSection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Token</span>
        <h2 className="ch-display">
          <span className="ch-accent-pado">NSN</span> Powers the Behavioral Economy
        </h2>
        <p className="ch-lead">
          NSN is the utility asset of the Nasun runtime.
          <br />
          As financial activity inside Nasun grows, protocol throughput routes into the token
          economy.
        </p>
      </FadeInUp>

      <FadeInUp delayMs={150}>
        <div className="ch-sink-grid">
          {SINKS.map((s) => (
            <div key={s.title} className="ch-sink">
              <span className="ch-sink-title">{s.title}</span>
              <p className="ch-body" style={{ marginTop: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </FadeInUp>

      <FadeInUp delayMs={300}>
        <p className="ch-body ch-subdued" style={{ fontSize: "0.875rem", maxWidth: "720px" }}>
          Detailed supply mechanics, allocation, and emission schedules will be published ahead
          of public testnet, following the completion of legal review and security audits. NSN
          is designed for network utility and governance participation. This is not an offer of
          securities.
        </p>
      </FadeInUp>
    </ChSection>
  );
}
