// EcosystemPositionsSection
//
// Top-of-dashboard surface that surfaces a user's open positions across the
// Nasun ecosystem apps plus any external dApps the user has linked. Renders
// one card per activated app and hides itself entirely when none would
// render. External-dApp cards additionally gate on a verified EVM wallet
// (useValidEvmAddress) so an unverified address can never drive a read.

import { useUjuAppDirectory } from "../../apps/UjuAppDirectoryProvider";
import { AavePositionsCard } from "./AavePositionsCard";
import { DriftPositionsCard } from "./DriftPositionsCard";
import { GostopPositionsCard } from "./GostopPositionsCard";
import { HyperliquidPositionsCard } from "./HyperliquidPositionsCard";
import { PadoPositionsCard } from "./PadoPositionsCard";
import { UniswapPositionsCard } from "./UniswapPositionsCard";
import { DRIFT_POSITIONS_AVAILABLE } from "./driftConfig";
import { useValidEvmAddress } from "./useValidEvmAddress";
import { useValidSolanaAddress } from "./useValidSolanaAddress";

export function EcosystemPositionsSection() {
  const { isPinned } = useUjuAppDirectory();
  const evmAddress = useValidEvmAddress();
  const solAddress = useValidSolanaAddress();

  const showPado = isPinned("pado");
  const showGostop = isPinned("gostop");
  const showUniswap = isPinned("uniswap") && !!evmAddress;
  const showHyperliquid = isPinned("hyperliquid") && !!evmAddress;
  const showAave = isPinned("aave") && !!evmAddress;
  // Drift additionally gates on its data host being reachable at all; see
  // DRIFT_POSITIONS_AVAILABLE. Without this the card renders a permanent
  // error for anyone who pinned Drift with a verified Solana address.
  const showDrift =
    DRIFT_POSITIONS_AVAILABLE && isPinned("drift") && !!solAddress;
  if (
    !showPado &&
    !showGostop &&
    !showUniswap &&
    !showHyperliquid &&
    !showAave &&
    !showDrift
  )
    return null;

  return (
    <section
      data-uju-anchor="ecosystem-positions"
      aria-label="Ecosystem positions"
      className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-3"
    >
      {showPado && <PadoPositionsCard />}
      {showGostop && <GostopPositionsCard />}
      {showUniswap && <UniswapPositionsCard />}
      {showHyperliquid && evmAddress && (
        <HyperliquidPositionsCard evmAddress={evmAddress} />
      )}
      {showAave && <AavePositionsCard />}
      {showDrift && <DriftPositionsCard />}
    </section>
  );
}
