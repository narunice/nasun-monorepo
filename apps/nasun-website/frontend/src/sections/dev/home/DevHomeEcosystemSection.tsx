import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

export default function DevHomeEcosystemSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-center text-center">
        <span className="ch-eyebrow">05 / Live on Devnet</span>
        <h2 className="ch-display">
          <span className="ch-accent-pado">Apps to Test</span> Nasun
        </h2>
      </FadeInUp>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-10 md:gap-0 items-stretch">
        <FadeInUp
          className="md:pl-16 md:pr-12 lg:pl-32 lg:pr-16 flex flex-col gap-6"
          delayMs={150}
        >
          <div>
            <h3
              className="text-2xl md:text-3xl tracking-wider text-transparent bg-clip-text"
              style={{
                fontFamily: '"pirulen", sans-serif',
                backgroundImage:
                  "linear-gradient(135deg, #3bb9d8 0%, #5ee1e4 100%)",
              }}
            >
              PADO
            </h3>
            <p
              className="ch-body mt-0  !font-medium tracking-wider"
              style={{ color: "var(--ch-fg-default)" }}
            >
              Unified Onchain Finance
            </p>
          </div>

          <div className="ch-body">
            <p>Spot trading and prediction markets</p>
            <p>Cross-margin and lending coming soon</p>
            <p>Deploy AI agents and compound rewards</p>
            <p>Onchain orderbook with verifiable execution</p>
          </div>

          <div className="ch-body">
            <p>Pado Leaderboard for weekly rewards</p>
            <p>Resets every Monday</p>
          </div>

          <p className="ch-body">Live on devnet since April 9th</p>

          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://pado.finance"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary ch-btn-invert"
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

        <FadeInUp
          className="md:pl-16 lg:pl-24 flex flex-col gap-6"
          delayMs={300}
        >
          <div>
            <h3
              className="text-3xl md:text-4xl italic font-medium leading-[1.05] tracking-tight text-transparent bg-clip-text -ml-1"
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                backgroundImage:
                  "linear-gradient(135deg, #fff8dc 0%, #f5e08a 30%, #d4af37 65%, #6b5214 100%)",
              }}
            >
              GoStop
            </h3>
            <p
              className="ch-body mt-1  !font-medium tracking-wider"
              style={{ color: "var(--ch-fg-default)" }}
            >
              Casino-style Mini-games
            </p>
          </div>

          <div className="ch-body">
            <p>Five games: Lottery, Scratch, Mines, Wheel, Number Match</p>
            <p>Every round settled onchain, provably fair</p>
            <p>Shared bankroll pool with live NAV</p>
            <p>Public transparency dashboard</p>
          </div>

          <div className="ch-body">
            <p>GoStop Leaderboard for weekly rewards</p>
            <p>Resets every Monday</p>
          </div>

          <p className="ch-body">Live on devnet since April 1st</p>

          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://gostop.app"
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn ch-btn-lg ch-btn-primary ch-btn-invert"
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
