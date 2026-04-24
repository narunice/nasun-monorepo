import { Transaction } from '@mysten/sui/transactions';
import {
  MINES_PACKAGE_ID,
  MINES_REGISTRY_ID,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
  SUI_RANDOM_ID,
} from '../../lib/gostop-config';

export function buildCreateSession(
  nusdcCoinId: string,
  betAmount: bigint,
  mineCount: number,
  extraCoinsToMerge: string[] = [],
): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(200_000_000);

  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const [bet] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(betAmount)]);

  tx.moveCall({
    target: `${MINES_PACKAGE_ID}::mines::create_session`,
    arguments: [
      tx.object(MINES_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      bet,
      tx.pure.u8(mineCount),
      tx.object(SUI_RANDOM_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildRevealCell(sessionId: string, cellIndex: number): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(100_000_000);
  tx.moveCall({
    target: `${MINES_PACKAGE_ID}::mines::reveal_cell`,
    arguments: [
      tx.object(sessionId),
      tx.object(MINES_REGISTRY_ID),
      tx.pure.u8(cellIndex),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildCashout(sessionId: string): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(100_000_000);
  tx.moveCall({
    target: `${MINES_PACKAGE_ID}::mines::cashout`,
    arguments: [
      tx.object(sessionId),
      tx.object(MINES_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
