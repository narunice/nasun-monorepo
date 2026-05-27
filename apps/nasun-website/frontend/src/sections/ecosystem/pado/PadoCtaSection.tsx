import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { trackCrossAppNav, withCrossAppParam } from "@/lib/analytics";

export default function PadoCtaSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-6 items-start text-left max-w-4xl">
        <span className="ch-eyebrow ch-eyebrow-cyan">07 / Start earning standing</span>
        <h2 className="ch-display">
          <span className="pd-accent">Trade.</span> Delegate.{" "}
          <span className="pd-accent">Compound.</span>
        </h2>
        <p className="ch-lead">
          Pado is live. Verify it yourself. Every order, settlement, and agent
          execution writes an onchain record that follows you to the next
          venue and to mainnet.
        </p>

        <div className="flex flex-wrap gap-3 mt-2">
          <a
            href={withCrossAppParam("https://pado.finance/", "nasun")}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCrossAppNav("pado", "/")}
            className="ch-btn ch-btn-lg ch-btn-primary"
          >
            Open Pado
          </a>
          <a
            href={withCrossAppParam("https://pado.finance/leaderboard", "nasun")}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCrossAppNav("pado", "/leaderboard")}
            className="ch-btn ch-btn-lg ch-btn-ghost"
          >
            See Leaderboard
          </a>
        </div>
      </FadeInUp>
    </ChSection>
  );
}
