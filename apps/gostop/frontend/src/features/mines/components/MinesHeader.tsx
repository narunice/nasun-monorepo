import { GameHeader } from "../../../components/shared/GameUI";
import minesThumb from "../../../assets/images/mines.webp";

export function MinesHeader() {
  return (
    <GameHeader
      thumb={minesThumb}
      category="Risk Escalation"
      title="Mines"
      description="Set your bet, choose how many mines to hide on a 5×5 grid, and reveal safe cells to grow your multiplier. Cash out anytime, but one mine ends the round."
    />
  );
}
