// Config + secret loading for nasun-address-book -- box-co-located de-Lambda compute service for the wallet
// address-book residual (AWS-exit Stage 4, wallet de-Lambda slice). The crown-jewel wallet ownership routes
// (register/list/remove) already live on identity-compute :3212; this service covers ONLY the address-book
// residual that still proxied to the 6pnnb6hcrd lambda: challenge / verify + address-book GET/POST.
//
// Clones the nasun-referral / nasun-leaderboard config contract, but the auth domain is fully self-contained:
// address-book auth is a SELF-ISSUED HS256 JWT (sub=walletAddress, iss 'nasun-ab', aud 'address-book'), NOT
// the dual-jwks identity JWT -- so there is NO identity-compute / explorer-api / dual-jwks dependency here.
//
// Secrets arrive via systemd LoadCredentialEncrypted -> $CREDENTIALS_DIRECTORY (tmpfs, host-bound), NOT
// plaintext env vars:
//  - pg-password: nasun_compute_ro read pool (SELECT on address_books).
//  - jwt-key: the addressBookJwtKey value ported from Secrets Manager (WALLET_PROOF_SECRET_NAME.addressBookJwtKey)
//    so tokens issued by the live lambda stay valid across cutover. Lazy-loaded; auth fails closed if absent.
//  - write-pg-password (Phase cutover only): the dedicated nasun_address_book writer role (RW on address_books
//    ONLY -- least privilege; a compromise can touch address books and nothing else).

import { readFileSync } from 'node:fs';

const credDir = process.env.CREDENTIALS_DIRECTORY;

function credPath(name: string, envOverride: string): string | null {
  return process.env[envOverride] || (credDir ? `${credDir}/${name}` : null);
}

function readRequired(name: string, envOverride: string): string {
  const path = credPath(name, envOverride);
  if (!path) {
    console.error(`[address-book] FATAL: ${name} not provided (CREDENTIALS_DIRECTORY/${name} or ${envOverride})`);
    process.exit(1);
  }
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (e) {
    console.error(`[address-book] FATAL: cannot read ${name}: ${(e as Error).message}`);
    process.exit(1);
  }
}

function readOptional(name: string, envOverride: string): string | undefined {
  const path = credPath(name, envOverride);
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
}

// :3210 issuer, :3211 identity, :3212 identity-compute, :3213 leaderboard, :3214 referral are taken;
// address-book takes :3215.
export const PORT = Number(process.env.ADDRESS_BOOK_PORT || 3215);
export const HOST = process.env.ADDRESS_BOOK_BIND || '127.0.0.1';

const pgHost = process.env.ADDRESS_BOOK_PG_HOST || '127.0.0.1';
const pgIsUnixSocket = pgHost.startsWith('/');

export const PG = {
  host: pgHost,
  port: Number(process.env.ADDRESS_BOOK_PG_PORT || 5432),
  database: process.env.ADDRESS_BOOK_PG_DATABASE || 'nasun_dal',
  username: process.env.ADDRESS_BOOK_PG_USER || 'nasun_compute_ro',
  password: pgIsUnixSocket
    ? readOptional('pg-password', 'ADDRESS_BOOK_PG_PASSWORD_FILE')
    : readRequired('pg-password', 'ADDRESS_BOOK_PG_PASSWORD_FILE'),
};

// Writer credential (dedicated nasun_address_book role: RW on address_books ONLY). Present ONLY at the cutover.
// Returns null when absent -- the read service (GET) + challenge/verify (in-memory + crypto, no PG) never need it.
export function writeCred(): { user: string; password: string } | null {
  const user = process.env.ADDRESS_BOOK_WRITE_PG_USER;
  const path = process.env.ADDRESS_BOOK_WRITE_PG_PASSWORD_FILE || (credDir ? `${credDir}/write-pg-password` : null);
  if (!user || !path) return null;
  try {
    return { user, password: readFileSync(path, 'utf8').trim() };
  } catch {
    return null;
  }
}

// HS256 signing key for the self-issued address-book JWT. Ported from Secrets Manager
// (WALLET_PROOF_SECRET_NAME.addressBookJwtKey). Lazy-loaded so the service can START inert without it (health
// works); auth routes (issue/verify) fail closed (401 / 500) until it is provisioned.
export function addressBookJwtKey(): string | undefined {
  return readOptional('jwt-key', 'ADDRESS_BOOK_JWT_KEY_FILE');
}

// CORS allowlist: byte-identical to the wallet-api lambda corsHeaders ALLOWED_ORIGINS (cdk constants/cors
// ALLOWED_ORIGINS_ENV -- the same superset the referral/leaderboard box services use).
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
