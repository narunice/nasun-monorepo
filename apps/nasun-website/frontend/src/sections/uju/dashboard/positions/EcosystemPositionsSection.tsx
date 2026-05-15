// EcosystemPositionsSection
//
// Top-of-dashboard surface that surfaces a user's open positions across the
// Nasun ecosystem apps. Renders one card per activated app and hides itself
// entirely when the user has activated none of the supported apps. External
// chain slots land in a follow-up PR.

import { useUjuAppDirectory } from "../../apps/UjuAppDirectoryProvider";
import { GostopPositionsCard } from "./GostopPositionsCard";
import { PadoPositionsCard } from "./PadoPositionsCard";

export function EcosystemPositionsSection() {
  const { isPinned } = useUjuAppDirectory();

  const showPado = isPinned("pado");
  const showGostop = isPinned("gostop");
  if (!showPado && !showGostop) return null;

  return (
    <section
      data-uju-anchor="ecosystem-positions"
      aria-label="Ecosystem positions"
      className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2"
    >
      {showPado && <PadoPositionsCard />}
      {showGostop && <GostopPositionsCard />}
    </section>
  );
}
