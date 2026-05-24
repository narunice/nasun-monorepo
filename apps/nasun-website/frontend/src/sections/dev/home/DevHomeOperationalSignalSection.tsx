import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

const STATS: Array<{ value: string; label: string }> = [
  { value: "10,500+", label: "verified testers connected with socials" },
  { value: "325", label: "contributors submitted" },
  { value: "946", label: "bug reports and feedback items in two months, 84% accepted and fixed by the team" },
  { value: "Three", label: "integrated products in production" },
  { value: "61", label: "consecutive days continuous uptime" },
  { value: "$0", label: "external funding" },
];

export default function DevHomeOperationalSignalSection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">05 / Devnet</span>
        <h2 className="ch-display">
          <span className="ch-accent-pado">Operational signal</span>{" "}
          <span className="ch-subdued">devnet</span>
        </h2>
      </FadeInUp>

      <FadeInUp delayMs={150}>
        <ul className="flex flex-col gap-3 max-w-[920px]">
          {STATS.map((s) => (
            <li key={s.label} className="ch-body">
              <span className="ch-accent" style={{ fontWeight: 500 }}>
                {s.value}
              </span>{" "}
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </FadeInUp>
    </ChSection>
  );
}
