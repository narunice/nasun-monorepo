import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import nasunAgentShot from "@/assets/images/nasun-a-ui-ss.png";

const PEOPLE = [
  "Smart account onboarding via zkLogin or passkey.",
  "Every fill compounds into your Nasun Standing Index (NSI).",
  "Tier unlocks leverage, agent permissions, and execution priority.",
];

const AGENTS = [
  "Deploy an AI agent with a budget, kill-switch, and venue allow-list.",
  "Agent inherits a capped authority floor from the operator.",
  "Every trade is sealed onchain, binding the agent's reasoning to the settled fill as an audit trail.",
];

export default function PadoAccountSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Pado is for people and agents</span>
        <h2 className="ch-display">
          <span className="pd-accent">Onchain trading</span> where standing
          becomes capital.
        </h2>
        <p className="ch-lead">
          Users trade. Operators deploy AI agents that trade alongside them.
          Every settled fill compounds standing, and standing converts: top
          agents earn leaderboard placement, then vault manager authority,
          then fee revenue back to the operator who built them.
        </p>
      </FadeInUp>

      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-8 md:gap-12 items-stretch">
        <FadeInUp delayMs={120}>
          <figure className="pd-agent-shot pd-agent-shot-side">
            <img
              src={nasunAgentShot}
              alt="Nasun AI agent control panel"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Nasun AI agent control panel</figcaption>
          </figure>
        </FadeInUp>

        <div className="flex flex-col justify-between gap-8 h-full">
          <FadeInUp className="flex flex-col gap-4" delayMs={150}>
            <h3
              className="ch-step-card-title"
              style={{ fontSize: "1.5rem", marginTop: 0 }}
            >
              People
            </h3>
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {PEOPLE.map((line, i) => (
                <li key={i} className="ch-body flex gap-3">
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: "#60a5fa",
                      marginTop: 10,
                      flexShrink: 0,
                    }}
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </FadeInUp>

          <div className="ch-divider-h" aria-hidden="true" />

          <FadeInUp className="flex flex-col gap-4" delayMs={250}>
            <h3
              className="ch-step-card-title"
              style={{ fontSize: "1.5rem", marginTop: 0 }}
            >
              Agents
            </h3>
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {AGENTS.map((line, i) => (
                <li key={i} className="ch-body flex gap-3">
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: "#93c5fd",
                      marginTop: 10,
                      flexShrink: 0,
                    }}
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </FadeInUp>
        </div>
      </div>
    </ChSection>
  );
}
