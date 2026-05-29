import { Gamepad2, ShieldCheck, Timer, Server, Wifi, Box } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

type TechCard = {
  icon: LucideIcon;
  title: string;
  bullets: string[];
};

const TECH: TechCard[] = [
  {
    icon: Gamepad2,
    title: "Unreal Engine 5",
    bullets: [
      "C++ codebase with full source access",
      "Production-grade rendering and physics",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Server-authoritative",
    bullets: [
      "Health, damage, ammo verified server-side",
      "No client-side trust for competitive integrity",
    ],
  },
  {
    icon: Timer,
    title: "Lag compensation",
    bullets: [
      "Client-side prediction for responsive input",
      "Server rewind for accurate hit detection",
    ],
  },
  {
    icon: Server,
    title: "AWS GameLift",
    bullets: [
      "Auto-scaling dedicated servers",
      "Low-latency matchmaking infrastructure",
    ],
  },
  {
    icon: Wifi,
    title: "Network-optimized",
    bullets: [
      "Bandwidth-efficient replication",
      "Designed for competitive tick rates",
    ],
  },
  {
    icon: Box,
    title: "3D art pipeline",
    bullets: [
      "Characters, weapons, environments in-house",
      "Custom animations and VFX pipeline",
    ],
  },
];

function useCardTilt() {
  const onMove = useCallback((e: RPointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 4}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 4}deg`);
  }, []);
  const onLeave = useCallback((e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  }, []);
  return { onMove, onLeave };
}

export default function SpectraTechNextSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">07 / Technical Foundation</span>
        <h2 className="ch-display">
          Built for <span className="gs-accent">competitive integrity</span>
        </h2>
        <p className="ch-lead">
          Not a blockchain game with a shooter attached. A competitive
          multiplayer shooter that happens to support ownership.
        </p>
      </FadeInUp>

      <div
        ref={gridRef}
        className="ch-step-grid"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {TECH.map((t) => {
          const Icon = t.icon;
          return (
            <FadeInUp key={t.title}>
              <article
                className="ch-step-card"
                data-spotlight-card=""
                onPointerMove={tilt.onMove}
                onPointerLeave={tilt.onLeave}
                style={{ minHeight: 240 }}
              >
                <span className="ch-step-card-halo" aria-hidden="true" />
                <span className="ch-step-card-glow" aria-hidden="true" />
                <header
                  className="ch-step-card-header"
                  style={{ alignItems: "center", gap: "0.6rem" }}
                >
                  <Icon
                    size={20}
                    style={{ color: "var(--ch-fg-accent)" }}
                    aria-hidden="true"
                  />
                  <span className="ch-step-card-eyebrow" style={{ marginLeft: "auto" }}>
                    Tech
                  </span>
                </header>
                <h3 className="ch-step-card-title" style={{ fontSize: "1.125rem" }}>
                  {t.title}
                </h3>
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
                  {t.bullets.map((b) => (
                    <li
                      key={b}
                      className="ch-step-card-body"
                      style={{ display: "flex", gap: "0.5rem", alignItems: "start" }}
                    >
                      <span
                        style={{
                          color: "var(--ch-fg-accent)",
                          fontSize: "0.7rem",
                          marginTop: "0.3rem",
                        }}
                      >
                        •
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </FadeInUp>
          );
        })}
      </div>

      {/* What's Next — 2 closing cards */}
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">08 / What's Next</span>
      </FadeInUp>

      <div className="ch-closing-grid">
        <FadeInUp>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">2026</span>
            <h3 className="ch-closing-title">Immediate roadmap</h3>
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
              {[
                "Complete Escape from Kramok map",
                "Public playtests and iteration",
                "Additional modes (TDM, CTF)",
              ].map((item) => (
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
        </FadeInUp>

        <FadeInUp>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">Beyond Alpha</span>
            <h3 className="ch-closing-title">The long arc</h3>
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
              {[
                "Expanded player counts",
                "Advanced Phantom mechanics",
                "New maps and faction conflicts",
                "Cinematic integration with the films",
              ].map((item) => (
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
        </FadeInUp>
      </div>
    </ChSection>
  );
}
