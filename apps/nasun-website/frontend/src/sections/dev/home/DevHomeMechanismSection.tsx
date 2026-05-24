import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

const STEPS: Array<{ index: string; label: string; body: string }> = [
  { index: "01", label: "Act", body: "A user or agent transacts onchain." },
  { index: "02", label: "Record", body: "Behavior is captured as an onchain receipt." },
  { index: "03", label: "Score", body: "Receipts update the Nasun Standing Index." },
  { index: "04", label: "Tier", body: "NSI resolves to an authority tier at runtime." },
  { index: "05", label: "Unlock", body: "Tier sets capital limits, leverage, and agent permissions." },
];

export default function DevHomeMechanismSection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">03 / Mechanism</span>
        <h2 className="ch-display">
          The <span className="ch-accent-pado">Compounding Loop</span>
        </h2>
        <p className="ch-lead">
          Every action a user or agent takes feeds the loop.
          <br />
          Every action a future user or agent takes inherits from it.
        </p>
      </FadeInUp>

      <FadeInUp delayMs={150}>
        <div className="ch-step-grid">
          {STEPS.map((s) => (
            <div key={s.index} className="ch-step">
              <span className="ch-step-index">{s.index}</span>
              <span className="ch-step-label">{s.label}</span>
              <p className="ch-body" style={{ marginTop: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </FadeInUp>

      <FadeInUp delayMs={300} className="max-w-[720px]">
        <p className="ch-body" style={{ color: "var(--ch-fg-default)" }}>
          Operator history shapes agent permissions. Agent activity feeds back into operator
          standing. Trust becomes a <span className="ch-accent">portable, compounding asset</span>.
        </p>
      </FadeInUp>
    </ChSection>
  );
}
