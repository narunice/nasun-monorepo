// IPC-serializable: only primitives (number/string/boolean). No BigInt/Date/Buffer.
// round-manager가 amount 등 bigint를 .toString()으로 변환 후 emit 보장.
// fork(serialization:'json')으로 parent에 전달되므로 non-primitive는 silently 손실됨.

export type RoundState = 'IDLE' | 'BETTING' | 'FLYING' | 'CRASHED' | 'RESOLVED';

export interface RecentRound {
  roundId: number;
  crashPointBps: number;
}

export type WsEvent =
  | { type: 'round_started'; roundId: number; roundObjectId: string; commitHash: string; bettingEndsAt: number; serverTime: number; stateVersion: number }
  | { type: 'betting_closed'; roundId: number; flyingStartedAt: number; stateVersion: number }
  | { type: 'crashed'; roundId: number; stateVersion: number }
  | { type: 'resolved'; roundId: number; crashPointBps: number; crashTimeMs: number; nextRoundAt: number; stateVersion: number }
  | { type: 'disabled'; reason: 'backoff' | 'shutdown'; retryAt?: number; stateVersion: number };

export interface CrashModuleDeps {
  wsServer: import('ws').WebSocketServer;
  logger: { info: (obj: object | string, msg?: string) => void; error: (obj: object | string, msg?: string) => void; warn: (obj: object | string, msg?: string) => void };
}
