import * as Tooltip from "@radix-ui/react-tooltip";
import {
  StandingPill,
  standingTooltipLines,
  useNasunStanding,
} from "@nasun/wallet-ui";

/**
 * Nasun Standing (NSI) badge for the Navbar.
 *
 * The pill and the fetch now live in @nasun/wallet-ui so Pado and GoStop show
 * the identical thing. What stays here is the Radix tooltip, which the shared
 * component deliberately does not own: wallet-ui has no Radix dependency, and
 * this app already mounts a Tooltip.Provider at the Navbar root. The tooltip
 * text comes from the same copy bundle the native tooltip uses, so the two
 * cannot drift.
 */

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL || "";

interface NavStandingBadgeProps {
  walletAddress: string | null | undefined;
}

export function NavStandingBadge({ walletAddress }: NavStandingBadgeProps) {
  const { standing } = useNasunStanding(walletAddress, EXPLORER_API);

  if (!standing) return null;

  const lines = standingTooltipLines({
    tier: standing.tier,
    nsiScore: standing.nsiScore,
    nextThreshold: standing.nextThreshold,
  });

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        {/* nativeTitle off: the Radix content below is the tooltip here, and
            two tooltips on one trigger fire over each other. */}
        <StandingPill
          tier={standing.tier}
          nsiScore={standing.nsiScore}
          nextThreshold={standing.nextThreshold}
          nativeTitle={false}
          data-testid="nav-standing-badge"
        />
      </Tooltip.Trigger>
      <Tooltip.Content
        side="bottom"
        align="center"
        sideOffset={5}
        className="max-w-[220px] px-3 py-2 bg-gray-300 text-nasun-black/80 text-xs border border-gray-500 rounded-lg"
      >
        <div className="font-semibold text-nasun-black">{lines.title}</div>
        <div className="mt-0.5">{lines.score}</div>
        {lines.next && <div className="mt-1">{lines.next}</div>}
        <div className="mt-2 text-nasun-black/60">{lines.desc}</div>
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

export default NavStandingBadge;
