// chat-server의 자식 프로세스로 실행되는 keeper.
// fork된 child라 process.send IPC 채널 자동 제공. parent에 broadcast event 전달.
//
// IPC primitives only (types.ts 주석 참조). BigInt/Date/Buffer 미사용.
import { RoundManager } from './round-manager.js';
import { CHILD_BACKSTOP_MS, CHILD_HARD_STOP_LEAD_MS } from './constants.js';

const {
  CRASH_OPERATOR_PRIVKEY,
  CRASH_SALT_DB_PATH,
  CRASH_BETTING_WINDOW_MS = '10000',
  CRASH_ROUND_INTERVAL_MS = '15000',
  CRASH_RPC_URL = 'https://rpc.devnet.nasun.io',
  CRASH_PKG,
  CRASH_REGISTRY,
} = process.env;

if (!CRASH_OPERATOR_PRIVKEY || !CRASH_SALT_DB_PATH || !CRASH_PKG || !CRASH_REGISTRY) {
  console.error('[crash-child] env missing (CRASH_OPERATOR_PRIVKEY/CRASH_SALT_DB_PATH/CRASH_PKG/CRASH_REGISTRY)');
  process.exit(1);
}

function emit(event: object) {
  if (typeof process.send === 'function') process.send(event);
}

const manager = new RoundManager(
  {
    rpcUrl: CRASH_RPC_URL,
    operatorPrivkey: CRASH_OPERATOR_PRIVKEY,
    saltDbPath: CRASH_SALT_DB_PATH,
    bettingWindowMs: parseInt(CRASH_BETTING_WINDOW_MS, 10),
    roundIntervalMs: parseInt(CRASH_ROUND_INTERVAL_MS, 10),
    packageId: CRASH_PKG,
    registryId: CRASH_REGISTRY,
  },
  emit,
);

let shutting = false;
async function shutdown() {
  if (shutting) return;
  shutting = true;
  // Drain: in-flight round runs to resolve, then runLoop exits via the draining guard.
  manager.stop({ drain: true });

  // Two-phase backstop. At t = CHILD_BACKSTOP_MS - CHILD_HARD_STOP_LEAD_MS we
  // flip to hard-stop so any pending sleep returns and the WAL flush has the
  // remaining lead time before exit. At t = CHILD_BACKSTOP_MS we exit.
  const HARD_STOP_AT = Math.max(0, CHILD_BACKSTOP_MS - CHILD_HARD_STOP_LEAD_MS);
  setTimeout(() => {
    console.warn('[Crash] Drain budget exhausted; hard-stopping');
    manager.stop();
  }, HARD_STOP_AT);
  setTimeout(() => {
    manager.close();    // sqlite WAL flush
    process.exit(0);
  }, CHILD_BACKSTOP_MS);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('disconnect', shutdown);  // parent 죽을 때

const started = await manager.start();
try { manager.close(); } catch {}  // sqlite WAL flush; safe to ignore if db never opened
if (!started) {
  // Boot-blocked: exit code 2 so the parent does not immediately respawn.
  process.exit(2);
}
process.exit(0);
