/**
 * Read-only orderbook health check across all spot markets.
 * Queries DeepBook V3 level2 for each market, reports best bid/ask, spread,
 * depth, and flags empty or crossed books. No transactions submitted.
 */
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { MARKETS, DEEPBOOK_PACKAGE, CLOCK_ID, RPC_URL } from '../lib/config.js';

const client = new SuiClient({ url: RPC_URL });

function parseU64Vector(bytes: number[]): bigint[] {
  if (!bytes || bytes.length === 0) return [];
  const result: bigint[] = [];
  let offset = 0;
  let length = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    length |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  for (let i = 0; i < length && offset + 8 <= bytes.length; i++) {
    let value = 0n;
    for (let j = 0; j < 8; j++) value |= BigInt(bytes[offset + j]) << BigInt(j * 8);
    result.push(value);
    offset += 8;
  }
  return result;
}

async function checkMarket(key: string) {
  const m = MARKETS[key];
  const priceExp = m.quoteDecimals + 9 - m.baseDecimals;
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::get_level2_ticks_from_mid`,
    typeArguments: [m.baseType, m.quoteType],
    arguments: [tx.object(m.poolId), tx.pure.u64(25), tx.object(CLOCK_ID)],
  });
  const r = await client.devInspectTransactionBlock({
    sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    transactionBlock: tx,
  });
  const status = r.effects?.status?.status;
  if (status === 'failure') {
    console.log(`${key.padEnd(5)} | QUERY FAILED: ${r.effects?.status?.error}`);
    return;
  }
  const rv = r.results?.[0]?.returnValues;
  if (!rv || rv.length < 4) {
    console.log(`${key.padEnd(5)} | NO DATA (malformed return)`);
    return;
  }
  const fp = (x: bigint) => Number(x) / Math.pow(10, priceExp);
  const fq = (x: bigint) => Number(x) / Math.pow(10, m.baseDecimals);
  const bidP = parseU64Vector(rv[0][0]);
  const bidQ = parseU64Vector(rv[1][0]);
  const askP = parseU64Vector(rv[2][0]);
  const askQ = parseU64Vector(rv[3][0]);

  const bestBid = bidP.length ? fp(bidP[0]) : 0;
  const bestAsk = askP.length ? fp(askP[0]) : 0;
  const bidLevels = bidP.length;
  const askLevels = askP.length;
  const bidDepth = bidQ.reduce((s, q) => s + fq(q), 0);
  const askDepth = askQ.reduce((s, q) => s + fq(q), 0);

  const flags: string[] = [];
  if (!bidLevels && !askLevels) flags.push('EMPTY-BOOK');
  else if (!bidLevels) flags.push('NO-BIDS');
  else if (!askLevels) flags.push('NO-ASKS');
  if (bestBid > 0 && bestAsk > 0 && bestBid >= bestAsk) flags.push('CROSSED');
  const spreadBps = bestBid > 0 && bestAsk > 0 ? ((bestAsk - bestBid) / bestBid) * 10000 : 0;

  const status_str = flags.length ? `*** ${flags.join(',')} ***` : 'OK';
  console.log(
    `${key.padEnd(5)} | bid=${bestBid.toFixed(4).padStart(12)} ask=${bestAsk.toFixed(4).padStart(12)} ` +
    `spread=${spreadBps.toFixed(1).padStart(7)}bps | levels b/a=${bidLevels}/${askLevels} ` +
    `depth b/a=${bidDepth.toFixed(3)}/${askDepth.toFixed(3)} | ${status_str}`
  );
}

(async () => {
  console.log(`Orderbook check @ ${new Date().toISOString()} (RPC=${RPC_URL})`);
  console.log('-'.repeat(120));
  for (const key of Object.keys(MARKETS)) {
    try {
      await checkMarket(key);
    } catch (e) {
      console.log(`${key.padEnd(5)} | ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }
})();
