import { useState, useEffect } from "react";
import { GenesisPassBadge } from "@nasun/wallet-ui";

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL || "";

interface EcoNavData {
  score: number;
  isPenalized: boolean;
  disabled: boolean;
  hasGenesisPass: boolean;
}

interface NavEcoPointsBadgeProps {
  identityId: string;
}

export function NavEcoPointsBadge({ identityId }: NavEcoPointsBadgeProps) {
  const [data, setData] = useState<EcoNavData | null>(null);

  useEffect(() => {
    if (!identityId || !EXPLORER_API) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${EXPLORER_API}/ecosystem/score/${encodeURIComponent(identityId)}`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled && json.data) {
          const activations: Array<{ nftType: string }> =
            json.data.activations ?? [];
          setData({
            score: json.data.allTime?.ecosystemScore ?? 0,
            isPenalized: json.data.isPenalized ?? false,
            disabled: json.data.disabled ?? false,
            hasGenesisPass: activations.some(
              (a) => a.nftType === "genesis-pass",
            ),
          });
        }
      } catch {
        // Silent fail
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identityId]);

  if (data === null) return null;

  const penalized = data.isPenalized || data.disabled;

  const tooltip = penalized
    ? "Ecosystem Points (Inactive - be active 2 days to recover)"
    : `Ecosystem Points: ${data.score.toLocaleString("en-US", { maximumFractionDigits: 0 })} (All Time)`;

  return (
    <div className="hidden sm:flex items-center gap-1.5">
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-default ${
          penalized
            ? "bg-zinc-500/10 text-zinc-500"
            : "bg-emerald-500/10 text-emerald-500"
        }`}
        title={tooltip}
      >
        {data.score.toLocaleString("en-US", { maximumFractionDigits: 0 })} pts
      </div>
      {data.hasGenesisPass && <GenesisPassBadge />}
    </div>
  );
}
