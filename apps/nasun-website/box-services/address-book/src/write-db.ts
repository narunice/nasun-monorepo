// PG write data-access layer for the box address-book service. Replaces the DynamoDB UpdateCommand in the
// lambda (handlers/addressBook.ts saveAddressBook) with a byte-parity optimistic-concurrency UPSERT over
// address_books. Role = nasun_address_book (write-pool.ts). The whole sanitized { entries, updatedAt } object
// is stored as attributes.addressBook (exactly what DDB stored), and attributes.addressBookVersion is the CAS
// counter.
//
// DDB semantics being mirrored (lambda addressBook.ts:121-140):
//   UpdateExpression: SET addressBook = :ab, addressBookVersion = if_not_exists(addressBookVersion, 0) + 1
//   ConditionExpression: attribute_not_exists(addressBookVersion) OR addressBookVersion = :expected
//   -> new row: created at version 1 regardless of :expected (attribute_not_exists short-circuits).
//   -> existing row, version == expected: version incremented.
//   -> existing row, version != expected: ConditionalCheckFailed -> conflict (409).

import type { AddressBookData } from './db';
import { getWriteSql } from './write-pool';

/**
 * Save with optimistic concurrency. Returns { conflict: true } if the row exists and its current version does
 * not match expectedVersion (parity with the DDB ConditionalCheckFailedException -> 409).
 */
export async function saveAddressBook(
  walletAddress: string,
  data: AddressBookData,
  expectedVersion: number,
): Promise<{ success: boolean; conflict: boolean; version?: number }> {
  const sql = getWriteSql();
  // sanitizedData is pure JSON at runtime; the cast satisfies postgres's strict JSONValue (a nominal interface
  // is not assignable to its index-signature object type, unlike a Record/literal).
  const payload = data as unknown as Parameters<typeof sql.json>[0];

  // sql.json(payload) sends the object as a json-typed param (serialized ONCE by the driver); jsonb_build_object
  // then embeds it as a nested object. Do NOT pre-JSON.stringify + ::jsonb -- the driver re-encodes a string
  // param as a JSON string, storing addressBook double-encoded (a jsonb string, not an object).
  //
  // INSERT path (no existing row): always succeeds at version 1 -- matches DDB attribute_not_exists, which
  // ignores :expected for a brand-new item. DO UPDATE path (row exists): the WHERE gate enforces the CAS;
  // when the version does not match, no row is updated and RETURNING yields zero rows -> conflict.
  const rows = await sql<{ version: number }[]>`
    INSERT INTO address_books (wallet_address, record_type, attributes)
    VALUES (
      ${walletAddress},
      'DATA',
      jsonb_build_object('addressBook', ${sql.json(payload)}, 'addressBookVersion', 1)
    )
    ON CONFLICT (wallet_address, record_type) DO UPDATE
      SET attributes = jsonb_build_object(
            'addressBook', ${sql.json(payload)},
            'addressBookVersion', COALESCE((address_books.attributes->>'addressBookVersion')::int, 0) + 1)
      WHERE COALESCE((address_books.attributes->>'addressBookVersion')::int, 0) = ${expectedVersion}
    RETURNING (attributes->>'addressBookVersion')::int AS version`;

  if (!rows.length) {
    return { success: false, conflict: true };
  }
  return { success: true, conflict: false, version: rows[0].version };
}
