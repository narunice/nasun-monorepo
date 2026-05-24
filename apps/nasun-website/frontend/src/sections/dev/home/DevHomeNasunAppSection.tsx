import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

export default function DevHomeNasunAppSection() {
  return (
    <ChSection>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <FadeInUp className="w-full">
          <img
            src="/images/nasun-a-ui-ss.webp"
            alt="Nasun App UI"
            className="w-full h-auto rounded-xl block"
            loading="lazy"
          />
        </FadeInUp>

        <FadeInUp className="flex flex-col gap-6" delayMs={150}>
          <span className="ch-eyebrow">04 / Product</span>
          <div>
            <h2 className="ch-logo">
              <span className="ch-logo-primary !font-changeling tracking-widest">
                NASUN
              </span>
              <span className="ch-logo-secondary !font-changeling" style={{ color: "#5ee1e4" }}>APP</span>
            </h2>
            <p className="ch-body mt-1" style={{ color: "var(--ch-fg-default)" }}>
              Agentic finance control center
            </p>
          </div>

          <div className="ch-body">
            <p>Deploy and govern agents</p>
            <p>Engagement surface for apps</p>
            <p>Payment modules</p>
            <p>Chain agnostic wallet and staking</p>
            <p>Track activity, points, scores</p>
          </div>

          <div className="ch-body">
            <p>Ecosystem Leaderboard for weekly rewards</p>
            <p>Resets every Monday</p>
          </div>

          <p className="ch-body">Live on devnet since April 3rd</p>

          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://app.nasun.io"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Open App
            </a>
          </div>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
