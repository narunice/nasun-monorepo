/**
 * Lottery E2E Tests
 *
 * SDK-L1: Buy ticket with valid numbers
 * SDK-L2: Buy ticket with invalid numbers (duplicate, out of range)
 * SDK-L3: Buy ticket on a closed round (self-contained: creates short-lived round)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  LOTTERY_PACKAGE_ID,
  LOTTERY_REGISTRY,
  LOTTERY_ADMIN_CAP,
  NUSDC_TYPE,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  getUserKeypair,
  getUserAddress,
  getAdminKeypair,
  execTx,
  expectTxFail,
  ensureBalance,
  findNusdcCoin,
  preflightCheck,
  waitForTx,
  sleep,
} from './helpers';

const TICKET_PRICE = 1_000_000n; // 1 NUSDC

// Find an active (non-expired) lottery round from recent events
async function findActiveRoundId(): Promise<string> {
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${LOTTERY_PACKAGE_ID}::lottery::RoundCreated`,
    },
    order: 'descending',
    limit: 10,
  });

  if (events.data.length === 0) {
    throw new Error('No lottery rounds found. Run seed-lottery.ts first.');
  }

  // Find a round whose close_time is in the future
  const now = Date.now();
  for (const evt of events.data) {
    const parsed = evt.parsedJson as any;
    const closeTime = Number(parsed.close_time);
    if (closeTime > now) {
      return parsed.round_id;
    }
  }

  throw new Error(
    'All lottery rounds are expired. Run: CLOSE_DAYS=7 npx tsx seed-lottery.ts',
  );
}

function buildBuyTicket(
  roundId: string,
  nusdcCoinId: string,
  numbers: number[],
): Transaction {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(TICKET_PRICE),
  ]);
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::buy_ticket`,
    arguments: [
      tx.object(roundId),
      tx.object(LOTTERY_REGISTRY),
      payment,
      tx.pure.u8(numbers[0]),
      tx.pure.u8(numbers[1]),
      tx.pure.u8(numbers[2]),
      tx.pure.u8(numbers[3]),
      tx.pure.u8(numbers[4]),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

describe('Lottery', () => {
  let roundId: string;

  beforeAll(async () => {
    await preflightCheck();
    await ensureBalance(getUserAddress(), NUSDC_TYPE, TICKET_PRICE * 10n);
    roundId = await findActiveRoundId();
  });

  it('SDK-L1: should buy a ticket with valid numbers [1,5,10,20,32]', async () => {
    const userAddr = getUserAddress();
    const nusdcCoin = await findNusdcCoin(userAddr, TICKET_PRICE);

    const tx = buildBuyTicket(roundId, nusdcCoin, [1, 5, 10, 20, 32]);
    const result = await execTx(tx, getUserKeypair());

    expect(result.effects?.status?.status).toBe('success');

    // Verify TicketPurchased event
    const event = result.events?.find((e) =>
      e.type.includes('TicketPurchased'),
    );
    expect(event).toBeDefined();

    const parsed = event!.parsedJson as any;
    expect(parsed.buyer).toBe(userAddr);

    // Verify ticket NFT was created
    const ticketObj = result.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('::lottery::Ticket'),
    );
    expect(ticketObj).toBeDefined();
  });

  it('SDK-L2: should reject duplicate numbers [1,1,2,3,4]', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), TICKET_PRICE);
    const tx = buildBuyTicket(roundId, nusdcCoin, [1, 1, 2, 3, 4]);
    await expectTxFail(tx, getUserKeypair());
  });

  it('SDK-L2: should reject out-of-range number [0,1,2,3,4]', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), TICKET_PRICE);
    const tx = buildBuyTicket(roundId, nusdcCoin, [0, 1, 2, 3, 4]);
    await expectTxFail(tx, getUserKeypair());
  });

  it('SDK-L3: should reject purchase on a closed round', async () => {
    // Wait for previous TXs to be fully indexed to avoid shared object contention
    await sleep(2000);
    const admin = getAdminKeypair();
    const adminAddr = admin.getPublicKey().toSuiAddress();

    // Create a round that closes in 2 seconds
    const now = BigInt(Date.now());
    const closeTime = now + 2000n;
    const drawTime = closeTime + 60_000n;

    const createTx = new Transaction();
    createTx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::create_round`,
      arguments: [
        createTx.object(LOTTERY_ADMIN_CAP),
        createTx.object(LOTTERY_REGISTRY),
        createTx.pure.u64(closeTime),
        createTx.pure.u64(drawTime),
        createTx.pure.u64(0), // no rollover
        createTx.object(CLOCK_ID),
      ],
    });

    const createResult = await execTx(createTx, admin);
    expect(createResult.effects?.status?.status).toBe('success');
    await waitForTx(createResult.digest);

    const newRound = createResult.objectChanges?.find(
      (c) =>
        c.type === 'created' &&
        c.objectType?.includes('::lottery::LotteryRound'),
    );
    expect(newRound).toBeDefined();
    const shortRoundId = (newRound as any).objectId;

    // Wait for close_time to pass
    await sleep(3000);

    // Close the round (permissionless)
    const closeTx = new Transaction();
    closeTx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::close_round_permissionless`,
      arguments: [closeTx.object(shortRoundId), closeTx.object(CLOCK_ID)],
    });

    const closeResult = await execTx(closeTx, admin);
    expect(closeResult.effects?.status?.status).toBe('success');
    await waitForTx(closeResult.digest);

    // Now try to buy a ticket on the closed round
    const nusdcCoin = await findNusdcCoin(getUserAddress(), TICKET_PRICE);
    const buyTx = buildBuyTicket(shortRoundId, nusdcCoin, [1, 2, 3, 4, 5]);
    await expectTxFail(buyTx, getUserKeypair());
  });
});
