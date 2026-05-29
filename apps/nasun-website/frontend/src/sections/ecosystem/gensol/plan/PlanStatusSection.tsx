import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

const NOW = [
  { label: "Spectra", status: "Alpha Live" },
  { label: "The Heist", status: "Pre-Production" },
];

const NEXT_2026 = [
  "Spectra public playtests",
  "The Heist animation production",
  "The Heir Apparent series development",
];

const NEXT_BEYOND = [
  "V Games trilogy pre-production",
  "Expanded multiplayer modes and maps",
  "Tournament ecosystem and competitive play",
];

export default function PlanStatusSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">04 / Status</span>
        <h2 className="ch-display">
          Now and <span className="gs-accent">what comes next</span>
        </h2>
      </FadeInUp>

      <div className="ch-closing-grid">
        <FadeInUp>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">Currently in Production</span>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0.4rem 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              {NOW.map((item) => (
                <li
                  key={item.label}
                  className="ch-body"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <span style={{ color: "#10b981" }}>✓</span>
                  <span style={{ fontWeight: 500, color: "var(--ch-fg-display)" }}>
                    {item.label}
                  </span>
                  <span style={{ color: "var(--ch-fg-subdued)" }}>({item.status})</span>
                </li>
              ))}
            </ul>
          </div>
        </FadeInUp>

        <FadeInUp>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">What's Next</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <div>
                <p
                  style={{
                    fontFamily: "var(--ch-font-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--ch-fg-subdued)",
                    marginBottom: "0.45rem",
                  }}
                >
                  2026
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                  }}
                >
                  {NEXT_2026.map((item) => (
                    <li
                      key={item}
                      className="ch-body"
                      style={{ display: "flex", gap: "0.55rem", alignItems: "start" }}
                    >
                      <span style={{ color: "var(--ch-fg-accent)", fontSize: "0.7rem", marginTop: "0.4rem" }}>
                        ▶
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p
                  style={{
                    fontFamily: "var(--ch-font-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--ch-fg-subdued)",
                    marginBottom: "0.45rem",
                  }}
                >
                  Beyond
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                  }}
                >
                  {NEXT_BEYOND.map((item) => (
                    <li
                      key={item}
                      className="ch-body"
                      style={{ display: "flex", gap: "0.55rem", alignItems: "start" }}
                    >
                      <span style={{ color: "var(--ch-fg-accent)", fontSize: "0.7rem", marginTop: "0.4rem" }}>
                        ▶
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
