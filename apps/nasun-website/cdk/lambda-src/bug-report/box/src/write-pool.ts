// Writer PG pool for the bug-report mutations (report submit/reply/admin-update, creator-post submit/score/
// reject/grant, backfill reward bookkeeping). Separate from db.ts's read pool (compute_ro): connects as
// nasun_bug_report (dedicated least-privilege role, RW on bug_reports + creator_posts ONLY). Lazily created so
// a pure-read deploy / shadow parity never touches it.

import postgres from 'postgres';
import { PG, writeCred } from './config';

let writeSql: ReturnType<typeof postgres> | null = null;

export function getWriteSql(): ReturnType<typeof postgres> {
  if (writeSql) return writeSql;
  const cred = writeCred();
  if (!cred) throw new Error('writer credential not provisioned (BUG_REPORT_WRITE_PG_USER + BUG_REPORT_WRITE_PG_PASSWORD_FILE)');
  writeSql = postgres({
    host: PG.host, port: PG.port, database: PG.database, username: cred.user, password: cred.password,
    max: 4, idle_timeout: 20, connect_timeout: 15, prepare: false, onnotice: () => {},
    connection: { statement_timeout: 30000, lock_timeout: 8000, idle_in_transaction_session_timeout: 30000 },
  });
  return writeSql;
}

export async function endWriteSql(): Promise<void> {
  if (writeSql) await writeSql.end({ timeout: 5 }).catch(() => {});
}
