import { GameHeader } from "../../../components/shared/GameUI";
import scratchThumb from "../../../assets/images/scratchcard.webp";

export function ScratchHeader() {
  return (
    <GameHeader
      thumb={scratchThumb}
      category="Instant Play"
      title="Scratch Cards"
      description="Buy up to ten cards in one transaction. Each card resolves instantly with provably-fair randomness. Multipliers up to 100×. Winning cards become NFTs in your wallet."
    />
  );
}
