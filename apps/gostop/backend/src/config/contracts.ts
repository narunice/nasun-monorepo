/**
 * Gostop contract identifiers consumed by the indexer.
 *
 * IMPORTANT: Sui emits events under the *originalPackageId* of a published
 * package, even after `package::publish_immutable` style upgrades. Event
 * subscription / type-tag filters must therefore use originalPackageId. The
 * mutable packageId is used only for tx construction (out of indexer scope).
 *
 * Source of truth: apps/gostop/devnet-ids.json (kept in sync at deploy time).
 */

import devnetIds from '../../../devnet-ids.json' with { type: 'json' };

export type GameKey =
  | 'lottery'
  | 'scratchcard'
  | 'numbermatch'
  | 'crash'
  | 'mines'
  | 'wheel';

export interface GameConfig {
  key: GameKey;
  gameId: number;            // 1..6, matches bankroll_pool GameCap.game_id
  packageId: string;         // current (upgraded) package
  originalPackageId: string; // event subscription anchor
}

const raw = devnetIds as unknown as {
  bankrollPool: { packageId: string; originalPackageId: string; bankrollPool: string };
  lottery: { packageId: string; originalPackageId: string; gameId: number };
  scratchcard: { packageId: string; originalPackageId: string; gameId: number };
  numbermatch: { packageId: string; originalPackageId: string; gameId: number };
  crash: { packageId: string; originalPackageId: string; gameId: number };
  mines: { packageId: string; originalPackageId: string; gameId: number };
  wheel: { packageId: string; originalPackageId: string; gameId: number };
};

export const BANKROLL_POOL = {
  packageId: raw.bankrollPool.packageId,
  originalPackageId: raw.bankrollPool.originalPackageId,
  bankrollPoolObjectId: raw.bankrollPool.bankrollPool,
} as const;

export const GAMES: Record<GameKey, GameConfig> = {
  lottery:     { key: 'lottery',     gameId: raw.lottery.gameId,     packageId: raw.lottery.packageId,     originalPackageId: raw.lottery.originalPackageId },
  scratchcard: { key: 'scratchcard', gameId: raw.scratchcard.gameId, packageId: raw.scratchcard.packageId, originalPackageId: raw.scratchcard.originalPackageId },
  numbermatch: { key: 'numbermatch', gameId: raw.numbermatch.gameId, packageId: raw.numbermatch.packageId, originalPackageId: raw.numbermatch.originalPackageId },
  crash:       { key: 'crash',       gameId: raw.crash.gameId,       packageId: raw.crash.packageId,       originalPackageId: raw.crash.originalPackageId },
  mines:       { key: 'mines',       gameId: raw.mines.gameId,       packageId: raw.mines.packageId,       originalPackageId: raw.mines.originalPackageId },
  wheel:       { key: 'wheel',       gameId: raw.wheel.gameId,       packageId: raw.wheel.packageId,       originalPackageId: raw.wheel.originalPackageId },
};

export const GAME_BY_ID = Object.fromEntries(
  Object.values(GAMES).map((g) => [g.gameId, g.key])
) as Record<number, GameKey>;

/**
 * Build a fully-qualified event type tag.
 * Example: eventType(BANKROLL_POOL.originalPackageId, 'bankroll_pool', 'GameResult')
 *   -> "0xb92e0...:bankroll_pool::GameResult"
 */
export function eventType(originalPackageId: string, module: string, name: string): string {
  return `${originalPackageId}::${module}::${name}`;
}

/**
 * Stream identifier used as `gostop.indexer_cursor.stream` PK.
 * Stable across deploys; do NOT include packageId (upgrades would orphan the cursor).
 */
export type StreamKey =
  | 'bankroll_pool::GameResult'
  | 'bankroll_pool::BetRefunded'
  | 'lottery::RoundCreated'
  | 'lottery::TicketPurchased'
  | 'lottery::NumbersDrawn'
  | 'lottery::RoundSettled'
  | 'lottery::PrizeClaimed'
  | 'lottery::UnclaimedSwept'
  | 'crash::RoundStarted'
  | 'crash::CashOutRecorded'
  | 'crash::RoundResolved'
  | 'crash::RoundRefunded';

export interface StreamDef {
  key: StreamKey;
  module: string;
  eventName: string;
  originalPackageId: string;
}

export const STREAMS: StreamDef[] = [
  { key: 'bankroll_pool::GameResult',  module: 'bankroll_pool', eventName: 'GameResult',  originalPackageId: BANKROLL_POOL.originalPackageId },
  { key: 'bankroll_pool::BetRefunded', module: 'bankroll_pool', eventName: 'BetRefunded', originalPackageId: BANKROLL_POOL.originalPackageId },
  { key: 'lottery::RoundCreated',      module: 'lottery',       eventName: 'RoundCreated',     originalPackageId: GAMES.lottery.originalPackageId },
  { key: 'lottery::TicketPurchased',   module: 'lottery',       eventName: 'TicketPurchased',  originalPackageId: GAMES.lottery.originalPackageId },
  { key: 'lottery::NumbersDrawn',      module: 'lottery',       eventName: 'NumbersDrawn',     originalPackageId: GAMES.lottery.originalPackageId },
  { key: 'lottery::RoundSettled',      module: 'lottery',       eventName: 'RoundSettled',     originalPackageId: GAMES.lottery.originalPackageId },
  { key: 'lottery::PrizeClaimed',      module: 'lottery',       eventName: 'PrizeClaimed',     originalPackageId: GAMES.lottery.originalPackageId },
  { key: 'lottery::UnclaimedSwept',    module: 'lottery',       eventName: 'UnclaimedSwept',   originalPackageId: GAMES.lottery.originalPackageId },
  { key: 'crash::RoundStarted',        module: 'crash',         eventName: 'RoundStarted',     originalPackageId: GAMES.crash.originalPackageId },
  { key: 'crash::CashOutRecorded',     module: 'crash',         eventName: 'CashOutRecorded',  originalPackageId: GAMES.crash.originalPackageId },
  { key: 'crash::RoundResolved',       module: 'crash',         eventName: 'RoundResolved',    originalPackageId: GAMES.crash.originalPackageId },
  { key: 'crash::RoundRefunded',       module: 'crash',         eventName: 'RoundRefunded',    originalPackageId: GAMES.crash.originalPackageId },
];
