import type { ComponentType, PointerEvent as RPointerEvent } from "react";
import { useCallback } from "react";
import {
  BarChart3,
  Target,
  MessageCircle,
  Wallet,
  Bot,
  Layers,
  Landmark,
  Globe,
  type LucideProps,
} from "lucide-react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

type Status = "live" | "alpha" | "soon";
type Product = {
  title: string;
  status: Status;
  Icon: ComponentType<LucideProps>;
  body: string;
};

const STATUS_LABEL: Record<Status, string> = {
  live: "LIVE",
  alpha: "ALPHA",
  soon: "SOON",
};

const PRODUCTS: Product[] = [
  {
    title: "Onchain Orderbooks",
    status: "live",
    Icon: BarChart3,
    body: "DeepBook V3 CLOB across four trading pairs. TP/SL and trailing stops included.",
  },
  {
    title: "Prediction Markets",
    status: "live",
    Icon: Target,
    body: "Binary YES/NO orderbooks on verifiable events, with a 10-level LP ladder.",
  },
  {
    title: "Execution Context",
    status: "live",
    Icon: MessageCircle,
    body: "Chat, Wavi narrator, news, and a weekly leaderboard, inside the trading view.",
  },
  {
    title: "Smart Account",
    status: "alpha",
    Icon: Wallet,
    body: "Self-custodial onboarding via zkLogin or passkey. No seed phrases.",
  },
  {
    title: "AI Agent Venue",
    status: "alpha",
    Icon: Bot,
    body: "Deploy a Nasun AI agent to trade within tier-bound budgets and kill-switches.",
  },
  {
    title: "Cross-Margin Perpetuals",
    status: "soon",
    Icon: Layers,
    body: "Up to 20x leverage sharing collateral with spot. Contracts deployed.",
  },
  {
    title: "Lending Primitives",
    status: "soon",
    Icon: Landmark,
    body: "Yield on idle collateral that still backs positions. V7 contracts deployed.",
  },
  {
    title: "Cross-Chain History",
    status: "soon",
    Icon: Globe,
    body: "ETH, Solana, and Sui activity seeding NSI at mainnet identity binding.",
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

export default function PadoProductsSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">04 / Live on Pado</span>
        <h2 className="ch-display">
          The execution venue,{" "}
          <span className="pd-accent">already running</span>.
        </h2>
        <p className="ch-lead">
          On Nasun devnet since April 9. Real users and agents writing receipts
          across orderbook, prediction, and agent surfaces in continuous
          production.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid">
        {PRODUCTS.map((p, i) => {
          const Icon = p.Icon;
          return (
            <FadeInUp key={p.title} delayMs={100 + i * 70}>
              <article
                className="ch-step-card"
                data-spotlight-card=""
                onPointerMove={tilt.onMove}
                onPointerLeave={tilt.onLeave}
                style={{ minHeight: 220 }}
              >
                <span className="ch-step-card-halo" aria-hidden="true" />
                <span className="ch-step-card-glow" aria-hidden="true" />
                <header
                  className="ch-step-card-header"
                  style={{ alignItems: "center" }}
                >
                  <Icon className="pd-card-icon" aria-hidden="true" />
                  <span className="pd-status" data-status={p.status}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </header>
                <span className="pd-card-rule" aria-hidden="true" />
                <h3 className="ch-step-card-title" style={{ marginTop: 4 }}>
                  {p.title}
                </h3>
                <p className="ch-step-card-body">{p.body}</p>
              </article>
            </FadeInUp>
          );
        })}
      </div>
    </ChSection>
  );
}
