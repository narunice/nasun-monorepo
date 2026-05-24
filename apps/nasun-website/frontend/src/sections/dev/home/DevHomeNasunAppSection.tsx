import { Link } from "react-router-dom";
import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

export default function DevHomeNasunAppSection() {
  return (
    <ChSection>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <FadeInUp className="w-full">
          <div className="ch-card p-3 md:p-4">
            <img
              src="/images/nasun-a-ui-ss.webp"
              alt="Nasun App UI"
              className="w-full h-auto rounded-[12px] block"
              loading="lazy"
            />
          </div>
        </FadeInUp>

        <FadeInUp className="flex flex-col gap-6" delayMs={150}>
          <span className="ch-eyebrow">04 / Product</span>
          <div>
            <h2 className="ch-display">
              <span className="ch-accent-pado">NASUN</span> APP
            </h2>
            <p className="ch-body ch-subdued mt-2">Agentic finance control center</p>
          </div>

          <ul className="ch-body" style={{ color: "var(--ch-fg-default)" }}>
            <li>Deploy and govern agents</li>
            <li>Engagement surface for apps</li>
            <li>Payment modules</li>
            <li>Chain agnostic wallet and staking</li>
            <li>Track activity, points, scores</li>
          </ul>

          <div className="ch-body">
            <p>Ecosystem Leaderboard for weekly rewards</p>
            <p>Resets every Monday</p>
          </div>

          <p className="ch-body">Live on devnet since April XXX</p>

          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://app.nasun.io"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Open App
            </a>
            <Link to="/about" className="ch-btn ch-btn-lg ch-btn-ghost">
              Learn More
            </Link>
          </div>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
