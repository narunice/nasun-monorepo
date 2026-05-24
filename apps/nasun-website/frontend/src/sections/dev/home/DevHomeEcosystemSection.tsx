import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

export default function DevHomeEcosystemSection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-center text-center">
        <span className="ch-eyebrow">06 / Ecosystem</span>
        <h2 className="ch-display">
          Explore <span className="ch-accent-pado">Nasun</span> Ecosystem
        </h2>
      </FadeInUp>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-10 md:gap-0 items-stretch">
        <FadeInUp className="md:pr-12 lg:pr-16 flex flex-col gap-6" delayMs={150}>
          <div>
            <h3 className="ch-display ch-accent-pado" style={{ fontWeight: 500 }}>
              PADO
            </h3>
            <p className="ch-body ch-subdued mt-1">Unified Onchain Finance</p>
          </div>

          <ul className="ch-body" style={{ color: "var(--ch-fg-default)" }}>
            <li>Spot Trading</li>
            <li>Prediction Markets</li>
            <li>Deploy agents and compound rewards</li>
            <li>Perps and lending coming soon</li>
          </ul>

          <div className="ch-body">
            <p>Pado Leaderboard for weekly rewards</p>
            <p>Resets every Monday</p>
          </div>

          <p className="ch-body">Live on devnet since April XXX</p>

          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://pado.finance"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Visit Pado
            </a>
            <a
              href="https://pado.finance/leaderboard"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-ghost"
            >
              Pado Leaderboard
            </a>
          </div>
        </FadeInUp>

        <div className="hidden md:block ch-divider-v" aria-hidden="true" />

        <FadeInUp className="md:pl-12 lg:pl-16 flex flex-col gap-6" delayMs={300}>
          <div>
            <h3
              className="ch-display"
              style={{ color: "#f9a824", fontStyle: "italic", fontWeight: 500 }}
            >
              GoStop
            </h3>
            <p className="ch-body ch-subdued mt-1">Casino-style Mini-games</p>
          </div>

          <ul className="ch-body" style={{ color: "var(--ch-fg-default)" }}>
            <li>5 Games</li>
            <li>Rounds settled onchain</li>
          </ul>

          <div className="ch-body">
            <p>GoStop Leaderboard</p>
          </div>

          <p className="ch-body">Live on devnet since April XXX</p>

          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://gostop.app"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Visit GoStop
            </a>
            <a
              href="https://gostop.app/leaderboard"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-ghost"
            >
              GoStop Leaderboard
            </a>
          </div>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
