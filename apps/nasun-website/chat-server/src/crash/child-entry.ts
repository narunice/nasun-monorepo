// chat-server의 자식 프로세스로 실행되는 keeper.
// fork된 child라 process.send IPC 채널 자동 제공. parent에 broadcast event 전달.
//
// IPC primitives only (types.ts 주석 참조). BigInt/Date/Buffer 미사용.
import { RoundManager } from './round-manager.js';

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
  manager.stop();
  // chat-server 17s backstop 정합. round-manager의 진행 중 라운드는 try/catch로 IDLE 복귀.
  setTimeout(() => {
    manager.close();    // sqlite WAL flush
    process.exit(0);
  }, 15000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('disconnect', shutdown);  // parent 죽을 때

await manager.start();
console.error('[crash-child] manager.start returned, exiting');
manager.close();
process.exit(0);
