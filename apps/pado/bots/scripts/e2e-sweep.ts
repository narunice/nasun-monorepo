/**
 * E2E sweep of every seed market created this session.
 *
 *   For each market:
 *     - Fetch on-chain status, close_time, resolve_deadline, resolution_criteria.
 *     - Detect resolver kind from criteria, parse it, call resolveXxx(now).
 *     - devInspect resolve_market(YES) and cancel_expired_market(); record the
 *       Move abort code so we can verify the keeper's expected path on chain.
 *     - Probe orderbook depth on all 4 sides.
 *
 *   No PTB is signed. Read-only.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 8000 } }));

import { detectKind } from '../lib/resolvers/types.js';
import { parseSpaceCriteria, resolveSpace, _clearSpaceCaches } from '../lib/resolvers/space.js';
import { parseMusicCriteria, resolveMusic } from '../lib/resolvers/music.js';
import { parseSportsCriteria, resolveSports, _clearSportsCaches } from '../lib/resolvers/sports.js';
import { parseWeatherCriteria, resolveWeather, _clearWeatherCaches } from '../lib/resolvers/weather.js';

_clearSpaceCaches(); _clearSportsCaches(); _clearWeatherCaches();

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) {
  console.error('e2e-sweep must not run against mainnet. Aborting.');
  process.exit(1);
}
const CLOCK_ID = '0x6';
const PACKAGE_ID = process.env.PREDICTION_PACKAGE_ID!;
const RESOLVER_KEY = process.env.PREDICTION_RESOLVER_KEY!;

const MARKETS: Array<[string, string]> = [
  ['Falcon MissionSucc',  '0x759daca3c2cccdd924d0e8dc37bc834507d6611e8c321108db8e49f89d46c185'],
  ['Falcon OnSchedule',   '0x74764e53127af7c1669bae9a1f7bf123af402da36038cc3a5c687987ae4e55df'],
  ['Drake US #1',         '0x1e2b7831fdae67384db6e635adc680dc01ecd47d840534e64ff4cdb29cd5b684'],
  ['Drake UK #1',         '0xe0249834ea03c7457aa3f318ee4f3d3f4d1cf5ee6845b6320307a2fb7f374a5d'],
  ['UCL PSG vs Arsenal',  '0xa552f5823975f1fa84e5390a78eae5fb2f30e0490d0aeb4b1191f89673ddfd17'],
  ['EPL ManCity-Villa',   '0x72a685f7e7b5d34f2e6e1f84c2276f33e584128e6bf8246c0c404234b508c0a9'],
  ['EPL Liverpool-Bren',  '0x169b0f98c542bda85e7f5cbece8c3d5598ecedc34ca6da90ddadafb73940a305'],
  ['Seoul max>30',        '0xf08dff8de2a397fa8487a212ca151e15438e45db597ebb5eeb2d0fb68135c9d3'],
  ['HCMC rainy>3',        '0xf9e4761d48bee67489ca0ce9e792239340a37d9373277cda2eeaa44002009863'],
  ['Frankfurt max>25',    '0xb81e292046f762b9b3accf1145b4f6225c820fbde75cfd461c81ccf2afeeda70'],
  ['NYC max>25',          '0x498befcdcab7f9630a13beec71c77f543f69b55ca9335c9a034e1ad7664ec9dc'],
];

function parseKp(s: string): Ed25519Keypair {
  if (s.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(s).secretKey);
  return Ed25519Keypair.fromSecretKey(Buffer.from(s.replace(/^0x/, '').toLowerCase(), 'hex'));
}

async function dispatchResolve(text: string, now: number) {
  const kind = detectKind(text);
  if (kind === 'space')   return await resolveSpace(parseSpaceCriteria(text), now);
  if (kind === 'music')   return await resolveMusic(parseMusicCriteria(text), now);
  if (kind === 'sports')  return await resolveSports(parseSportsCriteria(text), now);
  if (kind === 'weather') return await resolveWeather(parseWeatherCriteria(text), now);
  return { state: 'pending' as const, reason: `unknown kind: ${kind}` };
}

async function devInspect(client: SuiClient, sender: string, build: (tx: Transaction) => void): Promise<string> {
  const tx = new Transaction();
  build(tx);
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);
  try {
    const r = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
    if (r.effects?.status?.status === 'success') return 'success';
    const err = r.effects?.status?.error ?? '?';
    const m = /MoveAbort\([^,]+, (\d+)\)/.exec(err);
    return m ? `abort ${m[1]}` : err.slice(0, 80);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const m = /MoveAbort\([^,]+, (\d+)\)/.exec(msg);
    return m ? `abort ${m[1]}` : msg.slice(0, 60);
  }
}

async function orderbookDepth(client: SuiClient, marketId: string): Promise<[number, number, number, number]> {
  const m = await client.getObject({ id: marketId, options: { showContent: true } });
  const f = (m.data?.content as any).fields;
  const ids = ['yes_bids', 'yes_asks', 'no_bids', 'no_asks'].map(k => f[k]?.fields?.id?.id);
  const counts = await Promise.all(ids.map(async id => id ? (await client.getDynamicFields({ parentId: id, limit: 50 })).data.length : 0));
  return counts as [number, number, number, number];
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: RPC_URL });
  const resolverKp = parseKp(RESOLVER_KEY);
  const resolver = resolverKp.toSuiAddress();
  const now = Date.now();
  const header = `${'Market'.padEnd(22)} status close_in_h  resolve.state  resolve_market    cancel_expired   ob(yb/ya/nb/na)`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const [label, id] of MARKETS) {
    try {
      const m = await client.getObject({ id, options: { showContent: true } });
      const f = (m.data?.content as any).fields;
      const status = Number(f.status);
      const closeTime = Number(f.close_time);
      const closeIn = ((closeTime - now) / 3600_000).toFixed(1);
      const criteria = String(f.resolution_criteria);

      const result = await dispatchResolve(criteria, now);
      const resStr = result.state === 'resolved' ? `YES=${(result as any).outcome}` : `pending`;

      const resolveAbort = await devInspect(client, resolver, (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::prediction_market::resolve_market`,
          arguments: [tx.object(id), tx.pure.bool(true), tx.object(CLOCK_ID)],
        });
      });
      const cancelAbort = await devInspect(client, resolver, (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::prediction_market::cancel_expired_market`,
          arguments: [tx.object(id), tx.object(CLOCK_ID)],
        });
      });

      const ob = await orderbookDepth(client, id);

      console.log(
        `${label.padEnd(22)} ${String(status).padEnd(6)} ${closeIn.padStart(9)}  ${resStr.padEnd(13)} ${resolveAbort.padEnd(17)} ${cancelAbort.padEnd(16)} ${ob.join('/')}`,
      );
    } catch (err) {
      console.log(`${label.padEnd(22)} ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
