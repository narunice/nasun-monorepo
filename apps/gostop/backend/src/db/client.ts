import postgres, { type Sql } from 'postgres';
import { env } from '../env.js';

/**
 * Two pools:
 *   - `writer`: gostop_writer role. INSERT/UPDATE on gostop.* tables. NO
 *     access to public.* — preserves integrity-guard on activity_points.
 *   - `reader`: gostop_reader role. SELECT on gostop.* + selective public.*
 *     (activity_points, identity_to_wallet_map, nft_health_state,
 *     user_active_missions) for ecosystem-points cross-references.
 *
 * Both target the shared `nasun_points` Postgres instance. Connection cap is
 * kept below the role-level `CONNECTION LIMIT` so indexer + api together do
 * not starve the role.
 */

const common = {
  idle_timeout: 30,
  max_lifetime: 1800,
  connect_timeout: 10,
  connection: { statement_timeout: 30_000 },
} as const;

let _writer: Sql | null = null;
let _reader: Sql | null = null;

export function writer(): Sql {
  if (!_writer) {
    _writer = postgres(env.db.writeUrl, { ...common, max: env.db.poolMax });
  }
  return _writer;
}

export function reader(): Sql {
  if (!_reader) {
    const url = env.db.readUrl && env.db.readUrl.length > 0
      ? env.db.readUrl
      : env.db.writeUrl;
    _reader = postgres(url, { ...common, max: env.db.poolMax });
  }
  return _reader;
}

export async function closeAll(): Promise<void> {
  await Promise.all([
    _writer?.end({ timeout: 5 }),
    _reader?.end({ timeout: 5 }),
  ]);
  _writer = null;
  _reader = null;
}
