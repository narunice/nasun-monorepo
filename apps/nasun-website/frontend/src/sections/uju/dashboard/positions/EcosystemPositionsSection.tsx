// EcosystemPositionsSection
//
// Top-of-dashboard surface that surfaces a user's open positions across the
// Nasun ecosystem apps. Renders one card per activated app and hides itself
// entirely when the user has activated none of the supported apps. Phase 1
// covers Pado only; GoStop and external-chain apps land in follow-up PRs.

import { useUjuAppDirectory } from "../../apps/UjuAppDirectoryProvider";
import { PadoPositionsCard } from "./PadoPositionsCard";

export function EcosystemPositionsSection() {
  const { isPinned } = useUjuAppDirectory();

  const showPado = isPinned("pado");
  if (!showPado) return null;

  return (
    <section
      data-uju-anchor="ecosystem-positions"
      aria-label="Ecosystem positions"
      className="grid grid-cols-1 gap-4 sm:gap-5"
    >
      <PadoPositionsCard />
    </section>
  );
}
