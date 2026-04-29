/**
 * Derive keeper wallet addresses from env privkeys and print a ready-to-paste
 * KEEPER_GAS_TARGETS line for keeper-gas-watchdog.
 *
 * Run on the prod host where every keeper's .env values are loaded:
 *   set -a; . /home/ec2-user/nasun-chat-server/.env; . /home/ec2-user/pado-bots/.env; set +a
 *   pnpm tsx scripts/print-keeper-addresses.ts
 *
 * Skips keys that are missing or malformed; only resolved addresses appear in output.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// label -> env var name. Add new keepers here.
const KEEPERS: Array<{ label: string; envVar: string }> = [
  { label: 'crash', envVar: 'CRASH_OPERATOR_PRIVKEY' },
  { label: 'price-updater', envVar: 'ORACLE_ADMIN_KEY' },
  { label: 'tpsl', envVar: 'KEEPER_PRIVATE_KEY' },
  { label: 'lottery', envVar: 'LOTTERY_ADMIN_KEY' },
  { label: 'gostop-lottery', envVar: 'GOSTOP_LOTTERY_ADMIN_KEY' },
  { label: 'lp-nbtc', envVar: 'LP_PRIVATE_KEY_NBTC' },
  { label: 'lp-neth', envVar: 'LP_PRIVATE_KEY_NETH' },
  { label: 'lp-nsol', envVar: 'LP_PRIVATE_KEY_NSOL' },
];

function addrFromPrivkey(raw: string): string | null {
  try {
    const { secretKey } = decodeSuiPrivateKey(raw);
    return Ed25519Keypair.fromSecretKey(secretKey).getPublicKey().toSuiAddress();
  } catch {
    try {
      return Ed25519Keypair.fromSecretKey(Buffer.from(raw, 'hex')).getPublicKey().toSuiAddress();
    } catch {
      return null;
    }
  }
}

const resolved: Array<{ label: string; address: string }> = [];
for (const { label, envVar } of KEEPERS) {
  const raw = process.env[envVar];
  if (!raw) {
    console.warn(`[skip] ${label}: ${envVar} not set`);
    continue;
  }
  const addr = addrFromPrivkey(raw);
  if (!addr) {
    console.warn(`[skip] ${label}: ${envVar} malformed`);
    continue;
  }
  resolved.push({ label, address: addr });
  console.log(`${label.padEnd(16)} ${addr}`);
}

console.log('');
console.log('Add this line to /home/ec2-user/pado-bots/.env (or wherever pm2 sources):');
console.log('');
const line = resolved.map(({ label, address }) => `${label}:${address}`).join(',');
console.log(`KEEPER_GAS_TARGETS="${line}"`);
