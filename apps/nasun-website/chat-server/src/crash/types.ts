// IPC-serializable: only primitives (number/string/boolean). No BigInt/Date/Buffer.
// round-manager가 amount 등 bigint를 .toString()으로 변환 후 emit 보장.
// fork(serialization:'json')으로 parent에 전달되므로 non-primitive는 silently 손실됨.

export type RoundState = 'IDLE' | 'BETTING' | 'FLYING' | 'CRASHED' | 'RESOLVED';

export interface RecentRound {
  roundId: number;
  crashPointBps: number;
}

// Per-player payout row IPC'd from child to parent for history persistence.
// All fields JSON-safe (no BigInt/Buffer): u64 amounts as decimal strings,
// session_id as hex string (no leading 0x).
export interface ResolvePlayerRow {
  player: string;        // 0x-prefixed lowercased hex
  betAmount: string;     // u64 decimal string
  payout: string;        // u64 decimal string (0 if loss)
  multiplierBps: number; // realized payout/bet ratio in bps; 0 if loss
  timestampMs: number;
  sessionIdHex: string;
  // Digest of the user's place_bet tx. Discovered by querying BetPlaced events
  // for this round; null when the lookup fails or the row predates this field.
  betTx: string | null;
}

export type WsEvent =
  | { type: 'round_started'; roundId: number; roundObjectId: string; commitHash: string; bettingEndsAt: number; serverTime: number; stateVersion: number }
  | { type: 'betting_closed'; roundId: number; flyingStartedAt: number; stateVersion: number }
  | { type: 'crashed'; roundId: number; crashPointBps: number; stateVersion: number }
  | { type: 'resolved'; roundId: number; crashPointBps: number; crashTimeMs: number; nextRoundAt: number; stateVersion: number }
  | { type: 'disabled'; reason: 'backoff' | 'shutdown'; retryAt?: number; stateVersion: number }
  // Parent persists to history DB AND broadcasts to ws clients so the frontend
  // can confirm per-player payouts (cashout valid → payout > 0; cashout invalid
  // due to recorded_at > crash_deadline race → payout = 0).
  | { type: 'resolve_persisted'; roundId: number; resolveTx: string; rows: ResolvePlayerRow[]; stateVersion: number };

export interface CrashModuleDeps {
  wsServer: import('ws').WebSocketServer;
  logger: { info: (obj: object | string, msg?: string) => void; error: (obj: object | string, msg?: string) => void; warn: (obj: object | string, msg?: string) => void };
}
