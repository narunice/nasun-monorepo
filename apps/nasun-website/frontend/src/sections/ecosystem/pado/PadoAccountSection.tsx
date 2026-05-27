import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

const PEOPLE = [
  "Smart account onboarding via zkLogin or passkey, no seed phrases.",
  "Every fill, settlement, and prediction outcome lands as an onchain receipt.",
  "Risk-adjusted history compounds into your Nasun Standing Index (NSI).",
  "Tier unlocks leverage floors, agent permissions, and execution priority.",
];

const AGENTS = [
  "Deploy a Nasun AI agent with a budget, kill-switch, and venue allow-list.",
  "Agent inherits a capped authority floor from the operator's NSI tier.",
  "Agent execution receipts compound a track record of its own.",
  "Operator history shapes agent permissions; agent activity feeds back.",
];

export default function PadoAccountSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Pado is for people and agents</span>
        <h2 className="ch-display">
          Two operators.{" "}
          <span className="pd-accent">One execution record</span>.
        </h2>
        <p className="ch-lead">
          A human trader and an AI agent placing the same order land in the
          same orderbook, settle through the same risk engine, and write to
          the same NSI ledger. Trust becomes a portable, compounding asset.
        </p>
      </FadeInUp>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-10 md:gap-0 items-stretch">
        <FadeInUp className="md:pr-12 lg:pr-16 flex flex-col gap-5" delayMs={150}>
          <div className="flex items-baseline gap-3">
            <span className="ch-step-card-num">01</span>
            <h3
              className="ch-step-card-title"
              style={{ fontSize: "1.5rem", marginTop: 0 }}
            >
              People
            </h3>
          </div>
          <p className="ch-body">
            Traders run spot, perps, and prediction positions from a single
            smart account. The portfolio is evaluated as one unit. Every
            settled trade is signal that follows you to the next product.
          </p>
          <ul className="flex flex-col gap-3 list-none p-0 m-0">
            {PEOPLE.map((line, i) => (
              <li key={i} className="ch-body flex gap-3">
                <span
                  aria-hidden="true"
                  style={{
                    color: "#7d9dbf",
                    fontFamily: "var(--ch-font-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.22em",
                    paddingTop: 6,
                    minWidth: 28,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </FadeInUp>

        <div className="hidden md:block ch-divider-v" aria-hidden="true" />

        <FadeInUp className="md:pl-12 lg:pl-16 flex flex-col gap-5" delayMs={300}>
          <div className="flex items-baseline gap-3">
            <span className="ch-step-card-num">02</span>
            <h3
              className="ch-step-card-title"
              style={{ fontSize: "1.5rem", marginTop: 0 }}
            >
              Agents
            </h3>
          </div>
          <p className="ch-body">
            AI agents inherit a starting tier from their operator, then earn
            their own. Pado is the venue where an agent's economic record is
            actually written, not just claimed.
          </p>
          <ul className="flex flex-col gap-3 list-none p-0 m-0">
            {AGENTS.map((line, i) => (
              <li key={i} className="ch-body flex gap-3">
                <span
                  aria-hidden="true"
                  style={{
                    color: "#aac9d5",
                    fontFamily: "var(--ch-font-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.22em",
                    paddingTop: 6,
                    minWidth: 28,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
