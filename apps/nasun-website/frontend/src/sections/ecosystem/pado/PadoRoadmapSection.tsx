import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

type Phase = {
  label: string;
  title: string;
  body: string;
  status: "now" | "next" | "later";
};

const PHASES: Phase[] = [
  {
    label: "Now",
    title: "Devnet, 61+ days continuous",
    body: "Pado, GoStop, and Nasun AI Runtime live on devnet. NSI scoring active. Cross-chain history indexing across Ethereum, Solana, and Sui.",
    status: "now",
  },
  {
    label: "Next 4–6 months",
    title: "Public testnet and audits",
    body: "Public testnet, third-party security audits, senior protocol and infrastructure hires, and mainnet preparation.",
    status: "next",
  },
  {
    label: "Mainnet",
    title: "Funded trading and enforced floors",
    body: "Funded trading on Pado. Live NSI with runtime-enforced authority floors across native applications. Devnet history imports to mainnet through identity binding.",
    status: "next",
  },
  {
    label: "Post-mainnet",
    title: "Capital coordination layer",
    body: "Leverage minimums, liquidation parameters, cross-margin access, and agent capital limits derived from tier rather than from per-product configuration.",
    status: "later",
  },
  {
    label: "Long term",
    title: "Behavioral history as a portable risk signal",
    body: "External venues consume Nasun behavioral history when pricing users and agents, completing the loop from earned standing to portable capital authority.",
    status: "later",
  },
];

function StatusDot({ status }: { status: Phase["status"] }) {
  const styles: Record<Phase["status"], { color: string; glow: string }> = {
    now: { color: "#aac9d5", glow: "rgba(170, 201, 213, 0.55)" },
    next: { color: "#7d9dbf", glow: "rgba(125, 157, 191, 0.45)" },
    later: { color: "rgba(225, 229, 234, 0.35)", glow: "transparent" },
  };
  const s = styles[status];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: s.color,
        boxShadow: s.glow !== "transparent" ? `0 0 12px ${s.glow}` : undefined,
        flexShrink: 0,
      }}
    />
  );
}

export default function PadoRoadmapSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">06 / Roadmap</span>
        <h2 className="ch-display">
          Sequenced delivery,{" "}
          <span className="pd-accent">gated by signal</span>.
        </h2>
        <p className="ch-lead">
          Later phases activate only after earlier ones demonstrate sustained
          funded activity and retention. The behavioral economy is built on
          evidence, not promises.
        </p>
      </FadeInUp>

      <ol
        className="flex flex-col gap-0 list-none p-0 m-0"
        style={{ borderTop: "1px solid var(--ch-divider)" }}
      >
        {PHASES.map((p, i) => (
          <FadeInUp key={p.label} delayMs={100 + i * 80}>
            <li
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 0.8fr) 1fr",
                gap: "1.5rem",
                padding: "1.25rem 0 1.4rem",
                borderBottom: "1px solid var(--ch-divider)",
                alignItems: "start",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}
              >
                <StatusDot status={p.status} />
                <span
                  className="ch-step-card-eyebrow"
                  style={{ color: "#7d9dbf" }}
                >
                  {p.label}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h3 className="ch-step-card-title" style={{ marginTop: 0 }}>
                  {p.title}
                </h3>
                <p className="ch-step-card-body">{p.body}</p>
              </div>
            </li>
          </FadeInUp>
        ))}
      </ol>
    </ChSection>
  );
}
