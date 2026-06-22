// PG read data-access layer for the box address-book service. Replaces the DynamoDB GetItem in the wallet-api
// lambda (handlers/addressBook.ts getAddressBook) with a byte-parity SELECT over the box nasun_dal
// address_books mirror (Phase 1, 41,346 DATA rows). READ ONLY (role nasun_compute_ro). Writes live in
// write-db.ts (dedicated nasun_address_book role).
//
// Mirror layout (Phase 1 dal-load): address_books(wallet_address text, record_type text, attributes jsonb,
// expires_at timestamptz), PK (wallet_address, record_type). For DATA rows the attributes jsonb holds exactly
// { addressBook, addressBookVersion } -- there are no promoted typed columns for them, so the reconstructor
// just reads those two jsonb fields (verified 2026-06-22: 41,346/41,346 DATA rows carry both keys).

import postgres from 'postgres';
import { PG } from './config';

export const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 6, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: 15000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 },
});

export interface AddressBookData {
  entries: Record<string, unknown>;
  updatedAt: number;
}

/**
 * GetItem by PK (walletAddress, recordType='DATA'). Byte-parity with the lambda getAddressBook:
 * returns { addressBook: <the stored object> | null, version: <addressBookVersion> | 0 }.
 */
export async function getAddressBook(
  walletAddress: string,
): Promise<{ addressBook: AddressBookData | null; version: number }> {
  const rows = await sql<{ address_book: AddressBookData | null; version: string | null }[]>`
    SELECT attributes->'addressBook' AS address_book,
           attributes->>'addressBookVersion' AS version
    FROM address_books
    WHERE wallet_address = ${walletAddress} AND record_type = 'DATA'
    LIMIT 1`;
  if (!rows.length) return { addressBook: null, version: 0 };
  return {
    addressBook: rows[0].address_book ?? null,
    version: rows[0].version != null ? Number(rows[0].version) : 0,
  };
}
