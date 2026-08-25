// Writer PG pool for the referral mutations (apply / my-code reserve / appeal / admin approve-decline-resolve).
// Separate from db.ts's read pool (compute_ro): connects as nasun_identity (RW on referrals + referral_codes).
// Provisioned ONLY at the Phase 3b cutover. Lazily created so the read service + shadow parity never touch it.
//
// IMPORTANT: this role does NOT write user_profiles. The referralCode + lastReferralDeclinedAt user_profiles
// fields go through the identity-compute /profile/attributes-sync loopback (clients.ts), keeping user_profiles
// single-writer through nasun-identity (avoids a third writer / split-brain).

import postgres from 'postgres';
import { PG, writeCred } from './config';

let writeSql: ReturnType<typeof postgres> | null = null;

export function getWriteSql(): ReturnType<typeof postgres> {
  if (writeSql) return writeSql;
  const cred = writeCred();
  if (!cred) throw new Error('writer credential not provisioned (REFERRAL_WRITE_PG_USER + REFERRAL_WRITE_PG_PASSWORD_FILE)');
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
